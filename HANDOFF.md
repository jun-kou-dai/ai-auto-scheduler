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

## 3. 起動方法

```bash
cd /home/user/ai-auto-scheduler
npx expo start --web --port 8081 --clear
# ブラウザで http://localhost:8081 を開く
```

`--clear` はMetroバンドラーのキャッシュをクリアする。コード変更が反映されない場合に必須。

---

## 4. ファイル構成と各ファイルの役割

```
ai-auto-scheduler/
├── App.tsx                          # エントリ。ErrorBoundary → AuthProvider → AppRouter
├── index.ts                         # registerRootComponent(App)
├── app.json                         # Expo設定 (scheme: ai-auto-scheduler)
├── .env                             # 環境変数 (3つ)
├── package.json                     # 依存: expo, expo-auth-session, react-native-web
├── tsconfig.json                    # extends expo/tsconfig.base, strict: true
└── src/
    ├── types/index.ts               # 全型定義 (Task, CalendarEvent, Proposal等)
    ├── utils/envCheck.ts            # 起動時に環境変数チェック
    ├── contexts/AuthContext.tsx      # Google OAuth認証、トークン管理、localStorage永続化
    ├── services/
    │   ├── calendar.ts              # Google Calendar API (CRUD + freeBusy + 空き時間計算)
    │   ├── ai.ts                    # Gemini/Claude API呼び出し、タスク解析、JSONパース
    │   └── scheduler.ts            # 空き時間にタスクを配置するアルゴリズム (AIではない)
    ├── screens/
    │   ├── LoginScreen.tsx          # Googleログインボタン
    │   ├── DashboardScreen.tsx      # 今日・明日の予定表示、タップ展開、編集モーダル
    │   ├── TaskInputScreen.tsx      # テキスト入力 + 音声入力(Web Speech API) + AI解析
    │   ├── ProposalScreen.tsx       # 配置提案表示、タスク編集→再提案、承認→カレンダー作成
    │   └── SettingsScreen.tsx       # 連携状態・環境変数・デバッグ情報
    └── components/
        ├── ErrorBoundary.tsx        # React ErrorBoundary (白画面防止)
        ├── EnvError.tsx             # 環境変数不足時の案内画面
        ├── CalendarEventEditModal.tsx # カレンダー予定の編集モーダル (タイトル/時刻/メモ/削除)
        └── TaskEditModal.tsx        # タスクの編集モーダル (名前/所要時間/優先度/締切/時間帯)
```

---

## 5. 画面遷移フロー

```
LoginScreen → (Google OAuth) → DashboardScreen
                                    ↓
                               TaskInputScreen → (AI解析) → ProposalScreen → (承認) → DashboardScreen
                                    ↑                              ↓
                                    ← ← ← ← ← ← ← ← ← (戻る) ←

DashboardScreen → SettingsScreen (⚙ボタン)
```

画面遷移は `App.tsx` の `AppRouter` がstate (`screen`) で制御。`onNavigate(screen)` で切り替え。

---

## 6. データフロー

### 認証
1. `LoginScreen` → `useAuth().login()` → Google OAuth popup
2. `AuthContext` が `access_token` を受け取り localStorage に保存
3. `response.type === 'success'` → `fetchUserInfo()` でユーザー情報取得
4. `user` がセットされると `AppRouter` が自動で `dashboard` に遷移

### タスク入力→提案→カレンダー登録
1. `TaskInputScreen`: ユーザーがテキスト入力 (1行=1タスク)
2. `ai.ts analyzeTasks()`: Gemini APIに送信、JSONで返却 → `Task[]` に変換
3. `App.tsx handleTasksAnalyzed()`: tasks stateに追加
4. `ProposalScreen`:
   - `calendar.ts getBusySlots()` で7日間の予定を取得
   - `calendar.ts calculateFreeSlots()` で空き時間を計算 (9:00-21:00)
   - `scheduler.ts generateProposal()` でタスクを空き枠にマッピング
5. 承認ボタン → `calendar.ts createEventsFromProposal()` でGoogle Calendarにイベント作成

### 編集
- DashboardScreen: カレンダー予定タップ → 展開 → 「編集する」→ `CalendarEventEditModal`
  - 保存: `calendar.ts updateCalendarEvent()` (PATCH)
  - 削除: `calendar.ts deleteCalendarEvent()` (DELETE)
- ProposalScreen: タスクカードタップ → 展開 → 「編集して再提案」→ `TaskEditModal`
  - 保存後 `rePropose()` でキャッシュ済み空き時間を使って再計算 (API呼び出しなし)

---

## 7. 型定義 (src/types/index.ts)

```typescript
type Priority = '高' | '中' | '低';
type PreferredTime = '午前' | '午後' | '夜' | null;
type TaskStatus = 'unassigned' | 'scheduled';

interface Task {
  id: string;          // "task-{timestamp}-{index}"
  raw: string;         // ユーザーの元の入力テキスト
  name: string;        // AIが整理したタスク名
  duration_minutes: number;
  deadline: string | null;     // ISO string
  priority: Priority;
  preferred_time: PreferredTime;
  status: TaskStatus;
  reasoning: string;   // AIの推定根拠
}

interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  description?: string;
}

interface Proposal {
  events: ProposalEvent[];      // 配置できたタスク
  unassigned: UnassignedTask[]; // 配置できなかったタスク + 理由
}

type Screen = 'login' | 'dashboard' | 'taskInput' | 'proposal' | 'settings';
```

---

## 8. AIプロンプト (src/services/ai.ts)

- Gemini 2.0 Flash に日本語プロンプトを送信
- 入力: ユーザーのタスクテキスト (複数行)
- 出力: JSON配列 (name, duration_minutes, deadline, priority, preferred_time, reasoning)
- パース: markdownコードフェンス除去 → JSON.parse → バリデーション/フォールバック
- 「急ぎ」「至急」→ 高優先、「朝やりたい」→ 午前、等のルール付き

---

## 9. スケジューリングアルゴリズム (src/services/scheduler.ts)

**AIではない。** 純粋な決定的アルゴリズム:
1. タスクを優先度順にソート (締切近い→優先度高→所要時間長い)
2. 空き枠をスコアリング (preferred_time一致で+10点)
3. 各タスクをスコア最高の枠に配置
4. 配置できなかったタスクは理由付きで `unassigned` に

空き時間計算: 9:00-21:00を1日の範囲、15分未満の隙間は無視

---

## 10. Google OAuth設定

- Client ID: `472887512782-ss2q5s9uhim0h1j62rqtua5kdt6ns01g.apps.googleusercontent.com`
- Redirect URI: Expoが自動生成 (`AuthSession.makeRedirectUri()`)
- Response Type: **Token** (implicit flow)
- PKCE: **無効** (`usePKCE: false`) ← implicit flowではPKCEを使わない
- Scopes: `openid`, `profile`, `email`, `calendar`, `calendar.events`
- トークン永続化: `localStorage` (キー: `ai_scheduler_access_token`, `ai_scheduler_user`)

---

## 11. 既知のバグ・未解決の問題

### 11-A. Google Calendar API 401エラー (最重要)
**症状**: ログイン成功後、DashboardScreenでカレンダーAPI呼び出しが401エラーになることがある
**スクリーンショット確認済み**: エラーメッセージ「カレンダー取得失敗 (401)」が表示される
**考えられる原因**:
1. Google OAuth implicit flowのaccess_tokenの有効期限が短い (通常1時間)
2. tokenがlocalStorageに残っているが期限切れ → 再ログインしても古いトークンが使われる可能性
3. Google Cloud ConsoleでのOAuthスコープ承認が不完全な可能性
**対処方針**:
- `AuthContext.tsx` の `fetchUserInfo()` は401で自動クリアするが、Calendar API側の401ではトークンリフレッシュしていない
- `DashboardScreen.tsx` の `fetchEvents()` でcatchした401エラーで自動ログアウト/再認証するロジックが必要

### 11-B. ダッシュボードUIの反映問題
**症状**: コード上はイベントカードタップで展開(▼/▲)・編集モーダル表示を実装済みだが、ブラウザ上で反映が確認できていない
**考えられる原因**:
1. Metroバンドラーのキャッシュ (`--clear` で起動すれば解消するはず)
2. `TouchableOpacity` のWebでのタップイベント処理問題 → `Pressable` や `<div onClick>` に変更が必要かもしれない
3. スクリーンショットでは予定は表示されているが、`▼` 矢印が小さすぎて見えない可能性 (fontSize: 10)

### 11-C. ユーザーからのフィードバック
- 最新のスクリーンショットではカレンダー予定が正常に表示されている（401解消済みの時もある）
- 「何も変わらなかった」というフィードバックあり → 展開UIが動作していない可能性大

---

## 12. コミット履歴 (時系列)

| コミット | 内容 |
|---|---|
| `e2e785b` | Web MVP全体の初期実装 (全画面、OAuth、Calendar API、AI解析、スケジューラ) |
| `11e3dc8` | Google OAuth: PKCEを無効化 (implicit flowではPKCEが使えないため) |
| `de25fdc` | タスク詳細表示(展開UI)・編集モーダル・AI根拠表示を追加 |
| `809d9e1` | 提案画面のタスク展開・編集・再提案機能を修正 |
| `044a4da` | updateCalendarEvent / deleteCalendarEvent API関数追加 |
| `9dd6ba5` | ダッシュボード予定の編集・音声入力・日付ピッカー追加 |

---

## 13. 次にやるべきこと (優先順)

1. **401エラーの根本解決**: Calendar API呼び出しで401が返った場合にトークンをクリアして再認証するフローを追加
2. **展開UIの動作確認**: `TouchableOpacity` がWeb上で正常にonPressを発火しているかデバッグ。必要なら `Pressable` やHTML `<div onClick>` に置換
3. **トークンリフレッシュ**: implicit flowではrefresh_tokenがないため、有効期限 (1時間) が切れたら自動再認証 or Authorization Code flowへの移行
4. **エラーハンドリング強化**: 各API呼び出し箇所で401を検知して統一的にハンドリング

---

## 14. 依存関係

```json
{
  "expo": "~54.0.33",
  "expo-auth-session": "^7.0.10",
  "expo-crypto": "^15.0.8",
  "expo-status-bar": "~3.0.9",
  "expo-web-browser": "^15.0.10",
  "react": "19.1.0",
  "react-dom": "^19.1.0",
  "react-native": "0.81.5",
  "react-native-web": "^0.20.0"
}
```

devDependencies: `@types/react`, `typescript ~5.9.2`

外部UIライブラリは一切使っていない。全てReact Native標準コンポーネント。

---

## 15. Google Cloud Console設定

- OAuth 2.0 クライアントID: Webアプリケーション
- 承認済みJavaScriptオリジン: `http://localhost:8081` を追加する必要あり
- 承認済みリダイレクトURI: Expoの `makeRedirectUri()` が返す値 (通常 `https://auth.expo.io/@user/ai-auto-scheduler`)
- APIとサービス: Google Calendar API を有効化済みであること

---

## 16. 設計上の注意点

- **Expo Router未使用**: `app/` ディレクトリではなく `src/screens/` に画面を配置。ルーティングは `App.tsx` のswitch文
- **状態はApp.tsxで一元管理**: `tasks` 配列と `screen` 文字列がトップレベル。各画面はpropsで受け取る
- **ログアウト時のリセット**: `AuthContext.onLogout()` コールバック + `useEffect` でscreen/tasksをリセット
- **AIレスポンスのパース**: markdownコードフェンス対応、greedy/non-greedyの2段階JSON抽出
- **Web固有対応**: `Platform.OS === 'web'` で分岐。datetime-local入力はReact.createElement('input')で直接HTML要素を生成
