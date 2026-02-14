# デバッグ相談依頼

## お願いしたいこと

Expo (React Native Web) のスケジューラアプリで、タスクが配置されず「未割当」と表示されるバグがあります。原因の特定と修正方法を教えてください。

---

## 症状

ユーザーが「今日の9時からトレーニングをします」と入力すると、提案画面で以下が表示される:

- 「未割当タスク（N件）」
- 「締切り（2026/2/14）まで十分な連続空き時間はありません。」

**仕様ではダブルブッキングしてでも必ず全タスクを配置する**はずだが、配置されていない。

---

## 最大の謎

「締切り（2026/2/14）まで十分な連続空き時間はありません。」というメッセージが**現在のソースコード (src/) にも、ビルド済みバンドル (dist/) にも存在しない**。

```bash
grep -r "十分な" src/         → ヒットなし
grep -r "連続空き" src/       → ヒットなし
grep -r "未割当タスク" src/   → ヒットなし
# dist/ 内のJSバンドルにも同様にヒットなし
```

ソースにもバンドルにもないメッセージが画面に表示されている。

---

## 矛盾する事実

- タイムゾーンバグ（「今日」が前日になる問題）を `src/` で修正した後、ユーザーの画面で締切日が **2/13 → 2/14 に変わった**（= ソース修正が反映されている）
- しかし「未割当タスク」表示は**古いバージョンのUI**のはず（現在のProposalScreenにはその表示コードがない）
- **日付修正は反映されたのに、旧UIが残っている** — これをどう説明するか？

---

## 配信構成

```
npx expo export --platform web → dist/ にバンドル出力
node serve.js                  → dist/ を localhost:8081 で配信
```

- `dist/` のバンドルは **2026-02-13 22:59 UTC** に生成されたもの（古い）
- ソースコード (`src/`) はその後何度も修正済みだが、**`npx expo export` でリビルドしていない**
- つまりユーザーが見ているのは古いバンドルの可能性が高い
- ただし、上記の矛盾（日付修正は反映された）がある

---

## 環境

- Expo SDK 54, React Native Web
- サーバーのタイムゾーン: UTC（日本時間 -9時間）
- ユーザーのタイムゾーン: JST (Asia/Tokyo)
- AI: Gemini 2.0 Flash

---

## Git履歴（関連コミット・新しい順）

```
7578760 fix: 「〜時から」を開始時刻として扱う + sortTasksタイムゾーン修正
354b50d fix: 全日付表示をJST固定に修正（表示タイムゾーンバグ修正）
ee842bf fix: 全日付計算をJST固定に修正（タイムゾーンバグ修正）
a05291a feat: add no-cache static server (serve.js)
d5e1616 fix: 稼働時間を0-24時（終日）に変更
0439c9a fix: スケジューラー根本改修 - 常に全タスク配置、手動時刻変更対応
3643ab5 fix: 締切超過時のフォールバック配置 - 未割当ではなく最短空き枠に配置+警告表示
```

→ **`3643ab5` と `0439c9a` で「未割当にしない」設計に改修した**。つまりそれ以前のコードには「未割当」にする旧ロジックが存在した。

---

## 全ソースコード

### src/types/index.ts
```typescript
export type Priority = '高' | '中' | '低';
export type PreferredTime = '午前' | '午後' | '夜' | null;
export type TaskStatus = 'unassigned' | 'scheduled';

export interface Task {
  id: string;
  raw: string;
  name: string;
  duration_minutes: number;
  deadline: string | null;
  preferred_start: string | null; // 「9時から」→ 固定開始時刻
  priority: Priority;
  preferred_time: PreferredTime;
  status: TaskStatus;
  reasoning: string;
}

export interface ProposalEvent {
  taskId: string;
  title: string;
  start: string;
  end: string;
  warning?: string;
}

export interface UnassignedTask {
  taskId: string;
  reason: string;
}

export interface Proposal {
  events: ProposalEvent[];
  unassigned: UnassignedTask[];
}
```

### src/utils/timezone.ts
```typescript
const JST_TZ = 'Asia/Tokyo';
const pad2 = (n: number) => String(n).padStart(2, '0');

interface JSTComponents {
  year: number;
  month: number;   // 0-based
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  dayOfWeek: number;
}

function getJSTComponents(): JSTComponents {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: JST_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, weekday: 'short',
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '0';
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    year: parseInt(get('year')),
    month: parseInt(get('month')) - 1,
    day: parseInt(get('day')),
    hours: parseInt(get('hour')),
    minutes: parseInt(get('minute')),
    seconds: parseInt(get('second')),
    dayOfWeek: wdMap[get('weekday')] ?? 0,
  };
}

export function jstToDate(
  year: number, month: number, day: number,
  hours = 0, minutes = 0, seconds = 0,
): Date {
  const utcMs = Date.UTC(year, month, day, hours, minutes, seconds) - 9 * 3600000;
  return new Date(utcMs);
}

export function nowJST() {
  const c = getJSTComponents();
  const todayISO = `${c.year}-${pad2(c.month + 1)}-${pad2(c.day)}`;
  return {
    ...c,
    date: new Date(),
    startOfDay: jstToDate(c.year, c.month, c.day),
    todayISO,
  };
}

export function jstAddDays(year: number, month: number, day: number, days: number) {
  const d = new Date(Date.UTC(year, month, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

export function toISODateString(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

export function parseAsJST(s: string): Date {
  if (/[Z+-]\d{2}:?\d{2}$/.test(s) || s.endsWith('Z')) {
    return new Date(s);
  }
  if (s.includes('T')) {
    return new Date(s + '+09:00');
  }
  return new Date(s + 'T00:00:00+09:00');
}
```

### src/services/scheduler.ts（スケジューラ = タスク配置アルゴリズム）
```typescript
import { Task, FreeSlot, Proposal, ProposalEvent } from '../types';
import { parseAsJST, jstToDate, nowJST } from '../utils/timezone';

const PRIORITY_WEIGHT: Record<string, number> = { '高': 3, '中': 2, '低': 1 };

function normalizeDeadline(deadline: string | null): Date | null {
  if (!deadline) return null;
  if (!deadline.includes('T')) {
    const parts = deadline.split('-');
    if (parts.length === 3) {
      return jstToDate(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 23, 59, 59);
    }
  }
  const d = parseAsJST(deadline);
  if (isNaN(d.getTime())) return null;
  return d;
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.deadline && b.deadline) {
      const diff = parseAsJST(a.deadline).getTime() - parseAsJST(b.deadline).getTime();
      if (diff !== 0) return diff;
    } else if (a.deadline && !b.deadline) return -1;
    else if (!a.deadline && b.deadline) return 1;
    const pa = PRIORITY_WEIGHT[a.priority] || 2;
    const pb = PRIORITY_WEIGHT[b.priority] || 2;
    if (pa !== pb) return pb - pa;
    return b.duration_minutes - a.duration_minutes;
  });
}

function getPreferredHourRange(pref: Task['preferred_time']): [number, number] | null {
  switch (pref) {
    case '午前': return [6, 12];
    case '午後': return [12, 18];
    case '夜': return [18, 24];
    default: return null;
  }
}

export function generateProposal(tasks: Task[], freeSlots: FreeSlot[]): Proposal {
  const sortedTasks = sortTasks(tasks);
  const events: ProposalEvent[] = [];
  const remainingSlots = freeSlots.map((s) => ({
    start: new Date(s.start), end: new Date(s.end), durationMinutes: s.durationMinutes,
  }));

  for (const task of sortedTasks) {
    const needed = task.duration_minutes;
    let placed = false;
    const deadlineDate = normalizeDeadline(task.deadline);

    // preferred_start: 「9時から」等 → その時刻に配置
    if (task.preferred_start) {
      const fixedStart = parseAsJST(task.preferred_start);
      if (!isNaN(fixedStart.getTime())) {
        const fixedEnd = new Date(fixedStart.getTime() + needed * 60000);
        const warnings: string[] = [];
        const hasSlot = remainingSlots.some((s) => s.start <= fixedStart && s.end >= fixedEnd);
        if (!hasSlot) warnings.push('既存予定と重複する可能性があります');
        events.push({
          taskId: task.id, title: task.name,
          start: fixedStart.toISOString(), end: fixedEnd.toISOString(),
          warning: warnings.length > 0 ? warnings.join('。') : undefined,
        });
        const slotIdx = remainingSlots.findIndex((s) => s.start <= fixedStart && s.end >= fixedEnd);
        if (slotIdx >= 0) shrinkSlot(remainingSlots, slotIdx, fixedEnd);
        placed = true;
      }
    }
    if (placed) continue;

    const prefRange = getPreferredHourRange(task.preferred_time);
    const scoredSlots = remainingSlots
      .map((slot, idx) => {
        let score = 0;
        const slotHour = (slot.start.getUTCHours() + 9) % 24;
        if (prefRange && slotHour >= prefRange[0] && slotHour < prefRange[1]) score += 10;
        score -= idx * 0.01;
        return { slot, idx, score };
      })
      .sort((a, b) => b.score - a.score);

    // Pass 1: 締切内の空きスロットに配置
    for (const { slot, idx } of scoredSlots) {
      if (slot.durationMinutes >= needed) {
        const proposedEnd = new Date(slot.start.getTime() + needed * 60000);
        if (deadlineDate && proposedEnd > deadlineDate) continue;
        events.push({ taskId: task.id, title: task.name, start: slot.start.toISOString(), end: proposedEnd.toISOString() });
        shrinkSlot(remainingSlots, idx, proposedEnd);
        placed = true;
        break;
      }
    }

    // Pass 2: 締切を無視して空きスロットに配置
    if (!placed) {
      for (const { slot, idx } of scoredSlots) {
        if (slot.durationMinutes >= needed) {
          const proposedEnd = new Date(slot.start.getTime() + needed * 60000);
          const warning = deadlineDate
            ? `締切（${deadlineDate.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })}）を過ぎますが、最短の空き枠に配置しました`
            : undefined;
          events.push({ taskId: task.id, title: task.name, start: slot.start.toISOString(), end: proposedEnd.toISOString(), warning });
          shrinkSlot(remainingSlots, idx, proposedEnd);
          placed = true;
          break;
        }
      }
    }

    // Pass 3: ダブルブッキングで強制配置
    if (!placed) {
      const forceSlot = findForcePlacementSlot(task, deadlineDate);
      const warnings: string[] = [];
      warnings.push('空き枠が不足のため、既存予定と重複する可能性があります');
      if (deadlineDate && forceSlot.end > deadlineDate) {
        warnings.push(`締切（${deadlineDate.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })}）を過ぎています`);
      }
      events.push({ taskId: task.id, title: task.name, start: forceSlot.start.toISOString(), end: forceSlot.end.toISOString(), warning: warnings.join('。') });
    }
  }

  return { events, unassigned: [] };  // ← 常にunassigned空
}

function shrinkSlot(slots: { start: Date; end: Date; durationMinutes: number }[], idx: number, newStart: Date) {
  const slot = slots[idx];
  const remaining = (slot.end.getTime() - newStart.getTime()) / 60000;
  if (remaining < 15) slots.splice(idx, 1);
  else slots[idx] = { start: newStart, end: slot.end, durationMinutes: remaining };
}

function findForcePlacementSlot(task: Task, deadlineDate: Date | null): { start: Date; end: Date } {
  const now = new Date();
  const jst = nowJST();
  const needed = task.duration_minutes;
  const prefRange = getPreferredHourRange(task.preferred_time);
  let startHour = 9;
  if (prefRange) startHour = prefRange[0];
  const baseDate = jstToDate(jst.year, jst.month, jst.day + 1, startHour);

  if (deadlineDate && deadlineDate > now) {
    const tryStart = new Date(deadlineDate.getTime() - needed * 60000);
    if (tryStart > now) {
      const jstHour = (tryStart.getUTCHours() + 9) % 24;
      if (jstHour >= 6 && jstHour <= 23) return { start: tryStart, end: deadlineDate };
    }
  }
  return { start: baseDate, end: new Date(baseDate.getTime() + needed * 60000) };
}
```

### src/services/ai.ts（AIプロンプト部分のみ抜粋）
```typescript
function buildSystemPrompt(): string {
  const jst = nowJST();
  const todayISO = jst.todayISO;  // "2026-02-14"
  const tmr = jstAddDays(jst.year, jst.month, jst.day, 1);
  const tomorrowISO = toISODateString(tmr.year, tmr.month, tmr.day);
  // ... nextMondayISO計算 ...

  return `あなたはタスク分析AIです。...
=== 「〜から」と「〜まで」の区別（最重要） ===
「〜からXXする」「〜時にXXする」→ preferred_startに設定し、deadlineはnull。
「〜までにXXする」「〜まで」→ deadlineに設定し、preferred_startはnull。

例:
- 「今日の9時からトレーニング」→ preferred_start: "${todayISO}T09:00:00", deadline: null
- 「今日の15時まで」→ deadline: "${todayISO}T15:00:00", preferred_start: null
...`;
}
```

### src/screens/ProposalScreen.tsx（配置提案画面）

現在のソースでは `proposal.unassigned` を表示するUIが**存在しない**。`proposal.events` のみ表示している。
「未割当タスク」「十分な連続空き時間」というテキストはこのファイルに一切ない。

### src/services/calendar.ts（空き時間計算部分）
```typescript
export function calculateFreeSlots(
  busySlots: BusySlot[], daysAhead = 7,
  workStartHour = 0, workEndHour = 24  // 0時〜24時（終日）
): FreeSlot[] {
  const freeSlots: FreeSlot[] = [];
  const now = new Date();
  const jst = nowJST();

  for (let d = 0; d < daysAhead; d++) {
    const dayStart = jstToDate(jst.year, jst.month, jst.day + d, workStartHour);
    const dayEnd = jstToDate(jst.year, jst.month, jst.day + d, workEndHour);
    const effectiveStart = d === 0 && now > dayStart
      ? new Date(Math.ceil(now.getTime() / (30 * 60000)) * (30 * 60000))
      : dayStart;
    if (effectiveStart >= dayEnd) continue;
    // ... busyスロットを引いてfreeスロットを計算 ...
  }
  return freeSlots;
}
```

### serve.js（dist/配信サーバー）
```javascript
const DIST = path.join(__dirname, 'dist');
const PORT = 8081;
// no-cacheヘッダー付きで dist/ を配信
```

---

## 考えられる原因の仮説

1. **dist/ のリビルド忘れ（最有力）**: src/ の修正が dist/ に反映されていない。`npx expo export --platform web` が必要。
2. **Expo dev server と serve.js の混在**: 両方が動いていて、一部は最新コード（dev server経由）、一部は古い（dist/経由）。
3. **ブラウザキャッシュ / Service Worker**: dist/ を更新しても古いキャッシュが残っている。
4. **Expoキャッシュ**: `.expo/` や Metro バンドラーのメモリキャッシュに古いモジュールが残っている。

---

## 質問

1. ソースにもバンドルにもないメッセージ（「十分な連続空き時間はありません」）がブラウザに表示される原因として、他に何が考えられますか？
2. 日付修正は反映されたのに旧UIが残る矛盾をどう説明できますか？
3. 現在のソースコードにバグがあれば指摘してください。
4. 最も効率的なデバッグ手順を教えてください。
