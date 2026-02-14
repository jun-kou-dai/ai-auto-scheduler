# デバッグ相談依頼

## 依頼概要

「AI Auto Scheduler」というExpo (React Native Web) アプリのダッシュボード画面に、時間認識表示機能を追加しました。コードは正常にコンパイルされ、バンドルにも含まれていますが、**ブラウザ上で新機能が反映されません**。原因の特定と修正をお願いします。

---

## プロジェクト概要

- **アプリ名**: AI Auto Scheduler
- **技術スタック**: Expo SDK 54 + React Native Web + TypeScript
- **実行環境**: `npx expo start --web` でブラウザ上で動作
- **目的**: Google カレンダーと連携し、AIでタスクを分析してスケジュール提案するアプリ

### ファイル構成

```
ai-auto-scheduler/
├── App.tsx                          # ルーティング + タスク永続化 (localStorage)
├── package.json                     # Expo 54, React 19, react-native-web 0.20
├── src/
│   ├── types/index.ts               # 型定義
│   ├── utils/timezone.ts            # JST タイムゾーンユーティリティ
│   ├── contexts/AuthContext.tsx      # Google OAuth 認証
│   ├── services/
│   │   ├── calendar.ts              # Google Calendar API
│   │   ├── ai.ts                    # Gemini/Claude タスク分析
│   │   └── scheduler.ts             # ローカルスケジューラ
│   ├── screens/
│   │   ├── LoginScreen.tsx
│   │   ├── DashboardScreen.tsx      # ★ 問題のある画面
│   │   ├── TaskInputScreen.tsx
│   │   ├── ProposalScreen.tsx
│   │   └── SettingsScreen.tsx
│   └── components/
│       ├── ErrorBoundary.tsx
│       ├── CalendarEventEditModal.tsx
│       └── TaskEditModal.tsx
```

---

## 問題の詳細

### 追加した機能（最新コミット `4d22415`）

`DashboardScreen.tsx` に以下の機能を追加：

1. **現在時刻の表示**: セクションタイトル横に赤字で現在時刻を表示
2. **イベント状態判定**: `getEventStatus()` で過去/進行中/今後を判定
3. **過去イベントの薄表示**: `opacity: 0.55` + 「済」バッジ
4. **進行中イベントのハイライト**: 青い左ボーダー + 「進行中」バッジ
5. **Now インジケーター**: 赤い線と丸で現在時刻の位置を表示
6. **サマリーヒント**: 「3件終了 ・ 残り2件」等の表示
7. **未配置タスクバナー**: オレンジ色の通知バナー
8. **タスク永続化** (`App.tsx`): localStorage にタスクを保存

### 症状

- ブラウザ上で上記1〜7の**いずれも表示されない**
- TypeScript コンパイル (`npx tsc --noEmit`) はエラーなしで通る
- バンドル (`index.bundle?platform=web`) に `NowIndicator`, `getEventStatus`, `eventCardPast`, `currentBadge` 等のシンボルは含まれている
- サーバーを `--clear` 付きで再起動しても改善しない
- ブラウザのハードリフレッシュ (Ctrl+Shift+R) をしても改善しない

### 想定される原因候補

1. **ランタイムエラー**: コンポーネントが描画時にエラーを起こしている可能性（ErrorBoundary がキャッチしているか不明）
2. **`now` ステートの初期化**: `new Date()` がサーバーのタイムゾーン（UTC）で動いていて、JST のイベント時刻と比較がおかしい可能性
3. **`getEventStatus()` のロジック**: `event.end.dateTime` が undefined の場合（終日イベント等）の処理
4. **`NowIndicator` の配置ロジック**: `nowInsertIndex` の計算で、全イベントが過去の場合に正しくない位置に配置されている可能性
5. **スタイルの適用問題**: `react-native-web` での `opacity` や `borderLeftWidth` のレンダリング差異
6. **Metro キャッシュの根本的な問題**: バンドルに含まれているが、実際にブラウザに送信されているコードが古い可能性
7. **Hot Module Replacement (HMR) の不具合**: HMR が古いモジュールをキャッシュしたまま

---

## 主要ソースコード

### DashboardScreen.tsx の変更ポイント

#### 1. 時刻の状態管理（行 43-44, 70-74）

```tsx
const [now, setNow] = useState(new Date());

useEffect(() => {
  const timer = setInterval(() => setNow(new Date()), 30000);
  return () => clearInterval(timer);
}, []);
```

#### 2. イベント状態判定（行 110-119）

```tsx
const getEventStatus = (event: CalendarEvent): 'past' | 'current' | 'upcoming' => {
  if (!event.start.dateTime && event.start.date) return 'current';
  const start = new Date(event.start.dateTime || '');
  const end = new Date(event.end.dateTime || '');
  if (end.getTime() <= now.getTime()) return 'past';
  if (start.getTime() <= now.getTime()) return 'current';
  return 'upcoming';
};
```

**懸念**: `new Date('')` は `Invalid Date` を返す。`event.start.dateTime` が `undefined` の場合、`dateTime || ''` は `''` になり、`new Date('').getTime()` は `NaN`。`NaN <= now.getTime()` は `false` なので `upcoming` になるが、これは終日イベントのケースで、上の `if` 文で先にキャッチされるはず。

#### 3. Now インジケーター位置計算（行 129-137）

```tsx
const nowMs = now.getTime();
let nowInsertIndex = todayEvents.length;
for (let i = 0; i < todayEvents.length; i++) {
  const eventStart = new Date(todayEvents[i].start.dateTime || todayEvents[i].start.date || '').getTime();
  if (eventStart > nowMs) {
    nowInsertIndex = i;
    break;
  }
}
```

#### 4. EventCard コンポーネント（行 492-575）

```tsx
function EventCard({ event, status, isExpanded, onToggle, onEdit }: {
  event: CalendarEvent;
  status?: 'past' | 'current' | 'upcoming';
  // ...
}) {
  const isPast = status === 'past';
  const isCurrent = status === 'current';

  return (
    <View style={[
      styles.eventCard,
      isExpanded && styles.eventCardExpanded,
      isPast && styles.eventCardPast,
      isCurrent && styles.eventCardCurrent,
    ]}>
      ...
      {isPast && <Text style={styles.pastBadge}>済</Text>}
      {isCurrent && (
        <View style={styles.currentBadge}>
          <Text style={styles.currentBadgeText}>進行中</Text>
        </View>
      )}
    </View>
  );
}
```

**懸念**: `status` は optional prop (`status?`)。明日のイベントでは `status` を渡していない（行 333-340）：

```tsx
tomorrowEvents.map((e) => (
  <EventCard
    key={e.id}
    event={e}
    isExpanded={expandedEventId === e.id}
    onToggle={() => toggleExpandEvent(e.id)}
    onEdit={() => setEditingEvent({ ...e })}
  />
))
```

これは意図通り（明日のイベントにはステータス不要）。今日のイベントには `status={status}` を渡している（行 308-309）ので、今日のイベントにだけ適用されるはず。

#### 5. NowIndicator コンポーネント（行 478-488）

```tsx
function NowIndicator({ time }: { time: string }) {
  return (
    <View style={styles.nowIndicator}>
      <View style={styles.nowDot} />
      <View style={styles.nowLine} />
      <Text style={styles.nowText}>現在 {time}</Text>
    </View>
  );
}
```

#### 6. 未配置タスクバナー（行 261-279）

```tsx
{unassignedTasks.length > 0 && (
  <TouchableOpacity style={styles.unassignedBanner} onPress={() => onNavigate('proposal')}>
    ...
  </TouchableOpacity>
)}
```

### App.tsx の変更ポイント

タスクの localStorage 永続化を追加：

```tsx
const STORAGE_KEY_TASKS = 'ai_scheduler_tasks';

function getStoredTasks(): Task[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(STORAGE_KEY_TASKS);
      if (stored) return JSON.parse(stored);
    }
  } catch { /* ignore */ }
  return [];
}

// useState の初期値として使用
const [tasks, setTasks] = useState<Task[]>(getStoredTasks);

// tasks が変わるたびに保存
useEffect(() => {
  storeTasks(tasks);
}, [tasks]);
```

---

## デバッグ時に確認してほしいこと

### 最優先

1. **ブラウザのコンソール (F12 → Console) にエラーが出ていないか**
   - ランタイムエラーがあれば、ErrorBoundary の表示か、コンソールエラーとして出るはず
   - 特に `TypeError`, `Cannot read properties of undefined` 等

2. **実際にブラウザに配信されているバンドルの中身を確認**
   - DevTools → Sources → `index.bundle` → `NowIndicator` で検索
   - コードが本当に含まれているか

3. **React DevTools でコンポーネントツリーを確認**
   - `DashboardScreen` の props と state を確認
   - `now` の値、`todayEvents` の内容、`getEventStatus` の返り値

### 次に確認

4. **`todayEvents` が空になっていないか**
   - JST 日付計算 (`nowJST()`, `jstToDate()`) がサーバーのタイムゾーンの影響を受けていないか
   - `todayStart` と `tomorrowStart` の値をコンソールログで出力

5. **スタイルが正しく適用されているか**
   - DevTools → Elements → 該当要素のスタイルを確認
   - `opacity: 0.55` が適用されているか
   - `eventCardPast` のスタイルクラスが付与されているか

6. **`now` のタイムゾーン**
   - `now.getTime()` と `new Date(event.end.dateTime).getTime()` を比較
   - どちらも UTC ミリ秒なので、タイムゾーンの問題はないはずだが確認

---

## 環境情報

- Node.js: v22
- Expo SDK: 54
- React: 19.1.0
- react-native-web: 0.20.0
- TypeScript: 5.9.2
- ブラウザ: Chrome (Web 版のみ)
- サーバーOS: Linux 4.4.0

---

## 依頼事項

1. 上記の確認ポイントに基づいて、問題の原因を特定してください
2. 修正が必要な場合は、具体的なコード修正を提示してください
3. 修正後、ブラウザで以下が正しく動作することを確認してください：
   - 過去のイベントが薄く表示され「済」バッジが付く
   - 進行中のイベントが青いハイライトで「進行中」バッジが付く
   - 赤い Now インジケーターが正しい位置に表示される
   - セクションタイトル横に赤字で現在時刻が表示される
   - サマリーヒント（「N件終了 ・ 残りN件」）が表示される
   - 未配置タスクがある場合、オレンジのバナーが表示される
4. **全ての機能が正常に動作することを確認してから報告してください**

---

## 全ソースコード一覧

以下のファイルがプロジェクトの全ソースです。参照が必要な場合はお伝えください：

| ファイル | 行数 | 役割 |
|---|---|---|
| `App.tsx` | 155行 | ルーティング、タスク永続化 |
| `src/screens/DashboardScreen.tsx` | 950行 | ★問題の画面（時間認識表示） |
| `src/screens/TaskInputScreen.tsx` | 448行 | テキスト/音声タスク入力 |
| `src/screens/ProposalScreen.tsx` | 705行 | スケジュール提案表示 |
| `src/screens/LoginScreen.tsx` | — | Google ログイン |
| `src/screens/SettingsScreen.tsx` | — | 設定画面 |
| `src/services/calendar.ts` | 252行 | Google Calendar API操作 |
| `src/services/ai.ts` | 395行 | AI タスク分析 (Gemini/Claude) |
| `src/services/scheduler.ts` | 278行 | ローカルスケジューラ |
| `src/utils/timezone.ts` | 109行 | JST タイムゾーンユーティリティ |
| `src/types/index.ts` | 69行 | TypeScript 型定義 |
| `src/contexts/AuthContext.tsx` | 214行 | Google OAuth 認証コンテキスト |
| `src/components/ErrorBoundary.tsx` | 108行 | エラーバウンダリ |
| `src/components/CalendarEventEditModal.tsx` | 254行 | カレンダーイベント編集モーダル |
| `src/components/TaskEditModal.tsx` | 312行 | タスク編集モーダル |

よろしくお願いいたします。
