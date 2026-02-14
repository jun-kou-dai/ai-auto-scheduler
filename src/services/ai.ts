// Phase D: AI analysis service (JSON only output)
// Abstracted to support both Gemini and Claude
import { Task } from '../types';
import { nowJST, jstAddDays, toISODateString } from '../utils/timezone';

const AI_PROVIDER = process.env.EXPO_PUBLIC_AI_PROVIDER || 'gemini';
const AI_API_KEY = process.env.EXPO_PUBLIC_AI_API_KEY || '';

interface AITaskResult {
  name: string;
  duration_minutes: number;
  deadline: string | null;
  preferred_start: string | null;
  priority: '高' | '中' | '低';
  preferred_time: '午前' | '午後' | '夜' | null;
  reasoning: string;
}

// Build prompt dynamically so date is always current (BUG 14 fix)
function buildSystemPrompt(): string {
  // Use JST so dates always match the Japanese user's expectation
  const jst = nowJST();
  const todayISO = jst.todayISO;
  const tmr = jstAddDays(jst.year, jst.month, jst.day, 1);
  const tomorrowISO = toISODateString(tmr.year, tmr.month, tmr.day);
  const dayOfWeek = jst.dayOfWeek; // 0=日, 1=月, ..., 6=土
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
  const nm = jstAddDays(jst.year, jst.month, jst.day, daysUntilMonday);
  const nextMondayISO = toISODateString(nm.year, nm.month, nm.day);

  return `あなたはタスク分析AIです。ユーザーが入力した複数のタスクを構造化してください。
音声入力が主な入力方法のため、話し言葉やカジュアルな表現に対応してください。

必ず以下のJSON配列だけを返してください。余計な文章・マークダウン・説明は一切禁止です。

重要: ユーザーの入力1行につき、必ず1つのタスクオブジェクトを返してください。入力の行数と出力の配列の要素数は一致させてください。

各タスクの形式:
{
  "name": "タスク名",
  "duration_minutes": 所要時間（分、数値）,
  "deadline": "締切日時（ISO 8601形式）またはnull",
  "preferred_start": "開始希望日時（ISO 8601形式）またはnull",
  "priority": "高" or "中" or "低",
  "preferred_time": "午前" or "午後" or "夜" or null,
  "reasoning": "この推定の根拠（1-2文で簡潔に）"
}

=== タスク名のルール（最重要） ===
- ユーザーが言った言葉をそのまま使うこと。言い換え・意訳・類語への変更は禁止。
- 例: 「バイブコーディング」→ name: "バイブコーディング"（「バイブレーション」に変えない）
- 例: 「ミーティング」→ name: "ミーティング"（「会議」に変えない）
- 固有名詞・専門用語・カタカナ語はそのまま保持すること
- 音声認識の誤変換が明らかな場合のみ、最小限の修正を許可（例: 「ばいぶこーでぃんぐ」→「バイブコーディング」）

=== 日時の解析ルール（重要） ===
今日の日付: ${todayISO}
明日の日付: ${tomorrowISO}
来週月曜日: ${nextMondayISO}

日付の変換:
- 「今日」「今日中」→ deadline: "${todayISO}T23:59:00"
- 「明日」「明日まで」→ deadline: "${tomorrowISO}T23:59:00"
- 「来週」「来週まで」→ deadline: "${nextMondayISO}T23:59:00"
- 「金曜まで」「金曜日まで」→ その週の金曜日を計算してdeadlineに設定

=== 「〜から」と「〜まで」の区別（最重要） ===
「〜からXXする」「〜時にXXする」→ 開始時刻の指定。preferred_startに設定し、deadlineはnull。
「〜までにXXする」「〜まで」→ 締切の指定。deadlineに設定し、preferred_startはnull。

例:
- 「今日の9時からトレーニング」→ preferred_start: "${todayISO}T09:00:00", deadline: null
- 「明日10時からミーティング」→ preferred_start: "${tomorrowISO}T10:00:00", deadline: null
- 「15時に会議」→ preferred_start: "${todayISO}T15:00:00", deadline: null
- 「今日の15時まで」「15時までに」→ deadline: "${todayISO}T15:00:00", preferred_start: null
- 「9時まで」→ deadline: "${todayISO}T09:00:00", preferred_start: null

時刻の変換（「〜まで」パターン = 締切）:
- 「今日の15時まで」「今日15時まで」→ deadline: "${todayISO}T15:00:00"
- 「明日の10時まで」→ deadline: "${tomorrowISO}T10:00:00"
- 「9時まで」→ deadline: "${todayISO}T09:00:00"
- 「午後3時まで」→ deadline: 当日または翌日のT15:00:00
- 「夕方6時まで」→ deadline: 当日のT18:00:00

時間帯の変換:
- 「朝」「午前中」「朝やりたい」→ preferred_time: "午前"
- 「昼」「午後」「昼にやる」→ preferred_time: "午後"
- 「夜」「夜にやる」「夕方以降」→ preferred_time: "夜"

優先度の変換:
- 「急ぎ」「至急」「今日中」「すぐ」→ priority: "高"
- 「できれば」「そのうち」「暇な時」→ priority: "低"
- 不明な場合は priority: "中"

=== 所要時間の推定ルール ===
- 明示的に時間が指定された場合はそれを使う（例:「2時間」→120, 「30分」→30）
- 「30分くらい」「1時間ほど」などの表現も正確に読み取る
- 明示されていない場合、タスクの性質から推定（デフォルト60分）

reasoning記載ルール:
- 所要時間をなぜその値にしたか
- 優先度の判断理由
- 入力に時間や期限のヒントがあればそれを引用`;
}

// Parse AI response, extracting JSON from possible markdown fencing
function parseAIResponse(text: string): AITaskResult[] {
  let cleaned = text.trim();

  // Remove markdown code fencing if present
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    cleaned = jsonMatch[1].trim();
  }

  // Try to find JSON array (non-greedy to avoid capturing junk)
  const arrayMatch = cleaned.match(/\[[\s\S]*?\](?=[^[\]]*$)/);
  if (arrayMatch) {
    cleaned = arrayMatch[0];
  }
  // Fallback: try greedy if non-greedy fails to parse
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      throw new Error('not-array');
    }
    return parsed.map(validateTaskResult);
  } catch {
    // Try greedy match as fallback
    const greedyMatch = text.match(/\[[\s\S]*\]/);
    if (greedyMatch) {
      try {
        const parsed = JSON.parse(greedyMatch[0]);
        if (Array.isArray(parsed)) {
          return parsed.map(validateTaskResult);
        }
      } catch { /* fall through */ }
    }
    throw new Error(`AI応答のパースに失敗: 有効なJSON配列が見つかりません`);
  }
}

// Validate and apply fallback values
function validateTaskResult(item: any): AITaskResult {
  return {
    name: typeof item.name === 'string' ? item.name : '不明なタスク',
    duration_minutes:
      typeof item.duration_minutes === 'number' && item.duration_minutes > 0
        ? item.duration_minutes
        : 60,
    deadline: typeof item.deadline === 'string' ? item.deadline : null,
    preferred_start: typeof item.preferred_start === 'string' ? item.preferred_start : null,
    priority:
      item.priority === '高' || item.priority === '中' || item.priority === '低'
        ? item.priority
        : '中',
    preferred_time:
      item.preferred_time === '午前' ||
      item.preferred_time === '午後' ||
      item.preferred_time === '夜'
        ? item.preferred_time
        : null,
    reasoning: typeof item.reasoning === 'string' ? item.reasoning : '',
  };
}

// Gemini API call
async function callGemini(taskText: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${AI_API_KEY}`;
  const prompt = buildSystemPrompt();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt + '\n\n以下のタスクを分析してください:\n' + taskText },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Gemini APIエラー (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Gemini APIから空のレスポンスが返されました');
    }
    return text;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('AI APIがタイムアウトしました（30秒）。再度お試しください。');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// Claude API call
async function callClaude(taskText: string): Promise<string> {
  const prompt = buildSystemPrompt();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': AI_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: prompt,
        messages: [
          {
            role: 'user',
            content: '以下のタスクを分析してください:\n' + taskText,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Claude APIエラー (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text;
    if (!text) {
      throw new Error('Claude APIから空のレスポンスが返されました');
    }
    return text;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('AI APIがタイムアウトしました（30秒）。再度お試しください。');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// Main: Analyze tasks with configured AI provider
export async function analyzeTasks(rawInput: string): Promise<Task[]> {
  const lines = rawInput
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    throw new Error('タスクが入力されていません');
  }

  const taskText = lines.join('\n');
  let responseText: string;

  if (AI_PROVIDER === 'claude') {
    responseText = await callClaude(taskText);
  } else {
    responseText = await callGemini(taskText);
  }

  const aiResults = parseAIResponse(responseText);

  // Convert to Task objects (BUG 13 fix: use result.name as raw if index doesn't match)
  return aiResults.map((result, index): Task => ({
    id: `task-${Date.now()}-${index}`,
    raw: index < lines.length ? lines[index] : result.name,
    name: result.name,
    duration_minutes: result.duration_minutes,
    deadline: result.deadline,
    preferred_start: result.preferred_start,
    priority: result.priority,
    preferred_time: result.preferred_time,
    status: 'unassigned',
    reasoning: result.reasoning,
  }));
}
