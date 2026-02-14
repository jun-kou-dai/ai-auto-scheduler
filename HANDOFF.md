# AI Auto Scheduler - 引き継ぎ資料

## 0. ★★★ 最優先で読むこと ★★★

### 前任AIの失敗と教訓

前任のClaude Codeセッションは以下の失敗をした：

1. **ブラウザキャッシュ問題を解決できなかった** — `npx expo export --platform web` でビルドし `node serve.js` で配信しているが、ブラウザが古いJSバンドルをキャッシュし続け、ソースコードの変更が一度もブラウザに反映されなかった。no-cacheヘッダー、ファイル名変更、Clear-Site-Dataヘッダー、サービスワーカー解除スクリプト等を試したが全て失敗。
2. **ユーザーの要望を聞かず反論した** — ユーザーが「日付表示がわかりにくい、今日・明日ラベルをやめて日付のみにしろ」と指示したのに、「計算は正しい」と反論して修正を後回しにした。
3. **Chromeの翻訳機能に気づかなかった** — ユーザーのブラウザでGoogle翻訳（英語→日本語）が有効になっている。これが表示に影響している可能性がある。

### 次のAIがまずやるべきこと

**`npx expo start --web --port 8081 --clear` を使え。`serve.js` は使うな。**

Expo開発サーバーならホットリロードでコード変更が即座に反映される。`serve.js` + `npx expo export` の静的配信はブラウザキャッシュ問題で詰んだ。

```bash
# サーバー起動
npx expo start --web --port 8081 --clear

# ブラウザで http://localhost:8081 を開く
# コード変更は自動反映される
```

---

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

## 3. 未解決の問題（修正必須）

### 問題1: ソースコードの変更がブラウザに反映されない（最重要）

**状態**: ソースコード(`src/`)は修正済みだが、ブラウザでは古いコードが動いている。

**ソースには存在するがブラウザに反映されていない機能**:
- 黄色バナー「BUILD v2 2026-02-14 | 新コード実行中」（DashboardScreen.tsx 231-235行）
- 過去イベントの薄表示（opacity: 0.55）+ 「済」バッジ
- 現在進行中イベントの青ボーダー + 「進行中」バッジ
- 赤い現在時刻インジケーター線
- サマリーヒント「3件終了 ・ 残り2件」
- 未配置タスク通知バナー（オレンジ）
- セクション見出しの「今日」「明日」ラベル削除（日付のみ表示に変更済み）

**ビルド済みdist/のJSバンドル**: `dist/_expo/static/js/web/index-d2b2edde3ec51f89e88a2ed364361cc9.js`
- このファイルには新コード（黄色バナー等）が含まれている（grep確認済み）
- しかしブラウザが古いキャッシュを使い続ける

**推奨解決策**: `npx expo start --web --port 8081 --clear` でExpo開発サーバーを使う

### 問題2: 日付セクションの表示

**ユーザーの要望**: 「今日」「明日」ラベル不要。日付のみ表示。

**ソースコードの現在の状態**（修正済み）:
- `DashboardScreen.tsx` 316行: `<Text>{todayStr}</Text>` （「今日 - 」削除済み）
- `DashboardScreen.tsx` 356行: `<Text>{tomorrowStr}</Text>` （「明日 - 」削除済み）
- `todayStr` = `toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' })` → 例: "2月14日(土)"

**ブラウザではまだ旧表示**（「今日〜2月14日(土)」のまま）。問題1の解決が先。

### 問題3: Google翻訳の干渉

ユーザーのChromeで「英語を常に翻訳」が有効。ページの日本語テキストや記号が翻訳機能により変換されている可能性がある（例: " - " → "〜"）。対策として、HTMLの`<html lang="ja">`を設定して翻訳を抑制することを検討。

### 問題4: 「〜時からXXする」の解釈問題

**症状**: 「今日の9時からトレーニングをします」→ AIが deadline を `"2026-02-14T09:00:00"` に設定

**問題**: ユーザーは「9時に開始」を意図しているが、スケジューラは「9時までに完了」として扱う。

**修正案**: AIプロンプトに「〜からXXする」パターンの場合、deadlineではなく開始時刻（preferred_start_time）として扱うルールを追加。

---

## 4. ファイル構成

```
ai-auto-scheduler/
├── App.tsx                          # エントリ。ErrorBoundary → AuthProvider → AppRouter
├── index.ts                         # registerRootComponent(App)
├── serve.js                         # dist/配信用 no-cache 静的サーバー (port 8081) ※使わないこと
├── .env                             # 環境変数 (3つ)
└── src/
    ├── types/index.ts               # 全型定義 (Task, CalendarEvent, Proposal等)
    ├── utils/
    │   ├── timezone.ts              # ★ JST固定タイムゾーンユーティリティ
    │   └── envCheck.ts              # 起動時に環境変数チェック
    ├── contexts/AuthContext.tsx      # Google OAuth認証、トークン管理、localStorage永続化
    ├── services/
    │   ├── ai.ts                    # Gemini/Claude API呼び出し、タスク解析、JSONパース
    │   ├── calendar.ts              # Google Calendar API (CRUD + freeBusy + 空き時間計算)
    │   └── scheduler.ts             # 空き時間にタスクを配置するアルゴリズム
    ├── screens/
    │   ├── LoginScreen.tsx          # Googleログインボタン
    │   ├── DashboardScreen.tsx      # ★日付セクション + 予定表示 + 未配置タスク一覧
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

---

## 6. スケジューラの仕様 (`scheduler.ts`)

**設計思想**: 全タスクを必ず配置する。未割当にしない。ダブルブッキングもOK。

```
Pass 1: 締切内の空きスロットに配置（preferred_time優先）
Pass 2: 締切を無視して空きスロットに配置 + 警告
Pass 3: 空きがなくてもダブルブッキングで強制配置 + 警告
```

---

## 7. timezone.ts ユーティリティ

```typescript
nowJST()          // 現在のJST日時コンポーネント + todayISO + startOfDay
jstToDate(y,m,d,h,min,sec) // JST→UTC Date変換（月オーバーフロー対応）
jstAddDays(y,m,d,days)     // 日付加算（月跨ぎ対応）
toISODateString(y,m,d)     // "YYYY-MM-DD"文字列生成
parseAsJST(s)              // AI出力のdatetime文字列をJSTとしてパース
```

**重要**: 全日付計算は `timezone.ts` のユーティリティを使うこと。`new Date()` を直接使わないこと。

---

## 8. Git履歴（関連コミット・新しい順）

| コミット | 内容 |
|---|---|
| `4b20ff1` | serve.jsにClear-Site-Dataヘッダーとサービスワーカー解除を追加 |
| `b08483f` | セクション見出しから「今日」「明日」を削除し日付のみ表示 |
| `1eaf8a9` | revert: serve.js ポートを8081に戻す |
| `4d22415` | feat: ダッシュボードの時間認識表示 + タスク永続化 |
| `354b50d` | fix: 全日付表示をJST固定に修正 |
| `ee842bf` | fix: 全日付計算をJST固定に修正 |
| `3643ab5` | fix: 締切超過時のフォールバック配置 |

---

## 9. Google OAuth設定

- Client ID: `472887512782-ss2q5s9uhim0h1j62rqtua5kdt6ns01g.apps.googleusercontent.com`
- Response Type: Token (implicit flow)
- PKCE: 無効 (`usePKCE: false`)
- Scopes: `openid`, `profile`, `email`, `calendar`, `calendar.events`
- トークン永続化: `localStorage`

---

## 10. 設計上の注意点

- **Expo Router未使用**: `src/screens/` に画面を配置、`App.tsx` のswitch文でルーティング
- **状態はApp.tsxで一元管理**: `tasks` 配列と `screen` 文字列がトップレベル
- **AIレスポンスのパース**: markdownコードフェンス対応、greedy/non-greedyの2段階JSON抽出
- **Web固有対応**: `Platform.OS === 'web'` で分岐。datetime-local入力は `React.createElement('input')` で直接HTML要素を生成
- **ユーザーのブラウザ**: Chrome (MacBook)、Google翻訳が有効

---

## 11. ユーザーへの対応について

- ユーザーは技術者ではない。「計算が正しい」等の技術的な反論は不要
- 「わかりにくい」と言われたらすぐ直すこと
- コード変更後は必ずブラウザで反映されたことを確認してから「完了」と報告すること
- 反映されない場合は「完了」と言わず、配信方法の問題を先に解決すること
