# AI Auto Scheduler - 引き継ぎ資料

## 1. プロジェクト概要

**目的**: タスクをテキスト入力 → AIが所要時間・優先度・締切を推定 → Googleカレンダーの空き時間に自動配置するWebアプリ

**技術スタック**:
- Expo SDK 54 (React Native for Web)
- TypeScript (strict)
- Google OAuth 2.0 (implicit flow, PKCE無効)
- Google Calendar API v3 (REST直接呼び出し)
- AI: Gemini 2.0 Flash (切替可: Claude)
- 状態管理: React Context + useState (外部ライブラリなし)
- ルーティング: 手動 (state-based switch文、Expo Router未使用)

**ブランチ**: `claude/ai-scheduler-web-mvp-u3w4B`

---

## 2. 環境変数 (.env)

```
EXPO_PUBLIC_GOOGLE_CLIENT_ID=472887512782-ss2q5s9uhim0h1j62rqtua5kdt6ns01g.apps.googleusercontent.com
EXPO_PUBLIC_AI_PROVIDER=gemini
EXPO_PUBLIC_AI_API_KEY=AIzaSyB_qOiQX_rJ_CFZu3nFSGMZ5CenMXNFihE
```

---

## 3. ★最重要: 配信方法とビルドの問題

### 現在の配信方法
```bash
npx expo export --platform web   # → dist/ にビルド出力
node serve.js                     # → dist/ から http://localhost:8081 で配信
```

### ★ 致命的な問題: dist/ が古い
- `dist/` のJSバンドルは **2026-02-13 22:59 UTC** のビルド
- ソースコード (`src/`) は修正済みだが、**リビルドされていない**
- **ユーザーが見ているのは古い dist/ のコード**

### 修正手順
```bash
# 1. リビルド
npx expo export --platform web

# 2. サーバー再起動
# (既存のserve.jsプロセスを停止してから)
node serve.js

# 3. ブラウザでハードリロード (Ctrl+Shift+R)
```

### 代替: Expo dev server で開発
```bash
npx expo start --web --port 8081 --clear
```
`--clear` はMetroバンドラーのキャッシュクリア。コード変更が反映されない場合に必須。

---

## 4. ファイル構成と各ファイルの役割

```
ai-auto-scheduler/
├── App.tsx                          # エントリ。ErrorBoundary → AuthProvider → AppRouter
├── index.ts                         # registerRootComponent(App)
├── serve.js                         # dist/配信用 no-cache 静的サーバー (port 8081)
├── .env                             # 環境変数 (3つ)
└── src/
    ├── types/index.ts               # 全型定義 (Task, CalendarEvent, Proposal等)
    ├── utils/
    │   ├── timezone.ts              # ★ JST固定タイムゾーンユーティリティ（最近追加）
    │   └── envCheck.ts              # 起動時に環境変数チェック
    ├── contexts/AuthContext.tsx      # Google OAuth認証、トークン管理、localStorage永続化
    ├── services/
    │   ├── ai.ts                    # Gemini/Claude API呼び出し、タスク解析、JSONパース
    │   ├── calendar.ts              # Google Calendar API (CRUD + freeBusy + 空き時間計算)
    │   └── scheduler.ts             # 空き時間にタスクを配置するアルゴリズム (AIではない)
    ├── screens/
    │   ├── LoginScreen.tsx          # Googleログインボタン
    │   ├── DashboardScreen.tsx      # 今日・明日の予定表示 + 未配置タスク一覧
    │   ├── TaskInputScreen.tsx      # テキスト入力 + 音声入力(Web Speech API) + AI解析
    │   ├── ProposalScreen.tsx       # 配置提案表示 → 承認 → カレンダー登録
    │   └── SettingsScreen.tsx       # 設定画面
    └── components/
        ├── TaskEditModal.tsx        # タスクの編集モーダル
        ├── CalendarEventEditModal.tsx # カレンダーイベント編集モーダル
        ├── ErrorBoundary.tsx        # React ErrorBoundary
        └── EnvError.tsx             # 環境変数不足時の案内画面
```

---

## 5. 画面遷移フロー

```
LoginScreen → DashboardScreen → TaskInputScreen → ProposalScreen → DashboardScreen
                    ↓                                    ↓
               SettingsScreen                   承認 → カレンダー登録
```

1. **TaskInputScreen**: ユーザーがタスクを自然言語入力
2. **ai.ts**: AI がタスクを解析し `Task[]` を返す
3. **ProposalScreen**: scheduler.ts がカレンダーの空きスロットにタスクを配置
4. ユーザー承認 → calendar.ts でGoogleカレンダーにイベント作成

---

## 6. スケジューラの仕様 (`scheduler.ts`)

**設計思想**: 全タスクを必ず配置する。未割当にしない。ダブルブッキングもOK。

```
Pass 1: 締切内の空きスロットに配置（preferred_time優先）
Pass 2: 締切を無視して空きスロットに配置 + 警告
Pass 3: 空きがなくてもダブルブッキングで強制配置 + 警告
```

`generateProposal()` は常に `{ events: [...全タスク配置...], unassigned: [] }` を返す。

---

## 7. ★ 現在のバグ（未解決）

### バグA: 提案画面で「未割当タスク」が表示され配置されない

**症状**:
- 「今日の9時からトレーニングをします」を入力
- 提案画面に「未割当タスク（N件）」と表示
- 「締切り（2026/2/14）まで十分な連続空き時間はありません。」というメッセージ
- ダブりOKの仕様なのに配置されていない

**重大な手がかり**:
- 「締切り（2026/2/14）まで十分な連続空き時間はありません。」というメッセージは **現在の src/ にも dist/ にも存在しない**
  ```bash
  grep -r "十分な" src/   → ヒットなし
  grep -r "連続空き" src/ → ヒットなし
  grep -r "未割当タスク" src/ → ヒットなし
  ```
- 現在の `ProposalScreen.tsx` は `proposal.unassigned` を表示するUIを持っていない
- 現在の `scheduler.ts` は常に `unassigned: []` を返す

**考えられる原因**:
1. **dist/ が古いビルド（最有力）**: dist/ のバンドルは 2/13 ビルド。以前のバージョンのコードには「未割当タスク」表示と「十分な連続空き時間」メッセージが存在した可能性大。コミット `3643ab5`（締切超過時のフォールバック配置 - 未割当ではなく最短空き枠に配置+警告表示）で修正されたが、**dist/ がリビルドされていない**
2. **Expoキャッシュ**: `.expo/` にキャッシュが残っている可能性
3. **Metroバンドラーキャッシュ**: dev server使用時にメモリ内に古いモジュールがキャッシュ

**最初にやるべきこと**:
```bash
rm -rf dist/
npx expo export --platform web
node serve.js
# ブラウザで Ctrl+Shift+R
```

### バグB: タイムゾーン（修正済み・リビルド待ち）

**症状**: 「今日」と入力すると、前日の日付がAIに送信される（JST 2/14 8:07 → UTC 2/13 23:07 → 「今日=2/13」）

**原因**: 全ファイルで `new Date()` がシステムUTCを使用

**修正済み（src/のみ、dist/未反映）**:
- `src/utils/timezone.ts` を新規作成（JSTユーティリティ）
- `ai.ts`, `calendar.ts`, `scheduler.ts`, `DashboardScreen.tsx`, `ProposalScreen.tsx` をJST固定に修正
- コミット: `ee842bf`, `354b50d`

### バグC: 「〜時から」の解釈問題

**症状**: 「今日の9時からトレーニングをします」→ AIが deadline を `"2026-02-14T09:00:00"` に設定

**問題**: ユーザーは「9時に開始」を意図しているが、スケジューラは「9時までに完了」として扱う。9時前に60分の空きがないと配置できない。

**修正案**: AIプロンプトに「〜からXXする」パターンの場合、deadlineではなく開始時刻（preferred_start_time）として扱うルールを追加。または ProposalEvent に start_time_fixed フラグを追加し、スケジューラが開始時刻を固定して配置。

### バグD: sortTasks内のnew Date()

**場所**: `scheduler.ts` 33行目
```typescript
const diff = new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
```
`parseAsJST()` を使うべき。タイムゾーンなしのISO文字列がUTCとして解釈される。

---

## 8. timezone.ts ユーティリティ（最近追加）

```typescript
nowJST()          // 現在のJST日時コンポーネント + todayISO + startOfDay
jstToDate(y,m,d,h,min,sec) // JST→UTC Date変換（月オーバーフロー対応）
jstAddDays(y,m,d,days)     // 日付加算（月跨ぎ対応）
toISODateString(y,m,d)     // "YYYY-MM-DD"文字列生成
parseAsJST(s)              // AI出力のdatetime文字列をJSTとしてパース
```

---

## 9. AIプロンプト (`ai.ts`)

- `buildSystemPrompt()` で動的に生成
- 今日/明日/来週月曜日の日付をJSTで計算して埋め込む
- 入力パターン: 「今日の15時」「明日まで」「金曜日まで」「急ぎ」等
- 出力: JSON配列 `[{name, duration_minutes, deadline, priority, preferred_time, reasoning}]`
- パース: markdownコードフェンス除去 → JSON.parse → バリデーション

---

## 10. 型定義 (`src/types/index.ts`)

```typescript
interface Task {
  id: string;
  raw: string;           // ユーザーの元入力
  name: string;          // AIが整理したタスク名
  duration_minutes: number;
  deadline: string | null;      // ISO string
  priority: '高' | '中' | '低';
  preferred_time: '午前' | '午後' | '夜' | null;
  status: 'unassigned' | 'scheduled';
  reasoning: string;
}

interface Proposal {
  events: ProposalEvent[];      // 配置されたタスク
  unassigned: UnassignedTask[]; // 未配置タスク（現仕様では常に空）
}

interface UnassignedTask {
  taskId: string;
  reason: string;
}
```

---

## 11. Git履歴（関連コミット・新しい順）

| コミット | 内容 |
|---|---|
| `354b50d` | fix: 全日付表示をJST固定に修正（表示タイムゾーンバグ修正）|
| `ee842bf` | fix: 全日付計算をJST固定に修正（タイムゾーンバグ修正）|
| `a05291a` | feat: add no-cache static server (serve.js) |
| `d5e1616` | fix: 稼働時間を0-24時（終日）に変更 |
| `0439c9a` | fix: スケジューラー根本改修 - 常に全タスク配置、手動時刻変更対応 |
| `3643ab5` | fix: 締切超過時のフォールバック配置 - 未割当ではなく最短空き枠に配置+警告表示 |
| `6598fd5` | fix: AIプロンプトの日付をUTCからローカル時間ベースに修正 |

---

## 12. 次のAIへの推奨アクション（優先順）

1. **`npx expo export --platform web` でリビルドし `node serve.js` 再起動** → これだけで「未割当タスク」バグが解消する可能性が高い
2. リビルド後も問題が続く場合、ブラウザのDevToolsで実際に読み込まれているJSバンドルを確認
3. 「〜時からXXする」パターンで deadline ではなく開始時刻として扱う仕様をAIプロンプト・スケジューラに追加
4. `scheduler.ts` の `sortTasks()` 内の `new Date(a.deadline)` を `parseAsJST()` に修正
5. Expo dev server (`npx expo start --web --clear`) での開発を推奨（ホットリロードで即座に反映）

---

## 13. Google OAuth設定

- Client ID: `472887512782-ss2q5s9uhim0h1j62rqtua5kdt6ns01g.apps.googleusercontent.com`
- Redirect URI: Expoが自動生成
- Response Type: Token (implicit flow)
- PKCE: 無効 (`usePKCE: false`)
- Scopes: `openid`, `profile`, `email`, `calendar`, `calendar.events`
- トークン永続化: `localStorage`

---

## 14. 設計上の注意点

- **Expo Router未使用**: `src/screens/` に画面を配置、`App.tsx` のswitch文でルーティング
- **状態はApp.tsxで一元管理**: `tasks` 配列と `screen` 文字列がトップレベル
- **AIレスポンスのパース**: markdownコードフェンス対応、greedy/non-greedyの2段階JSON抽出
- **Web固有対応**: `Platform.OS === 'web'` で分岐。datetime-local入力は `React.createElement('input')` で直接HTML要素を生成
- **タイムゾーン**: 全日付計算は `src/utils/timezone.ts` のJST固定ユーティリティを使用すること。`new Date()` を直接使わないこと
