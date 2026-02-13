// Phase D: AI analysis service (JSON only output)
// Abstracted to support both Gemini and Claude
import { Task } from '../types';

const AI_PROVIDER = process.env.EXPO_PUBLIC_AI_PROVIDER || 'gemini';
const AI_API_KEY = process.env.EXPO_PUBLIC_AI_API_KEY || '';

interface AITaskResult {
  name: string;
  duration_minutes: number;
  deadline: string | null;
  priority: '高' | '中' | '低';
  preferred_time: '午前' | '午後' | '夜' | null;
  reasoning: string;
}

// Build prompt dynamically so date is always current (BUG 14 fix)
function buildSystemPrompt(): string {
  return `あなたはタスク分析AIです。ユーザーが入力した複数のタスクを構造化してください。

必ず以下のJSON配列だけを返してください。余計な文章・マークダウン・説明は一切禁止です。

重要: ユーザーの入力1行につき、必ず1つのタスクオブジェクトを返してください。入力の行数と出力の配列の要素数は一致させてください。

各タスクの形式:
{
  "name": "タスク名（簡潔に）",
  "duration_minutes": 所要時間（分、数値）,
  "deadline": "締切日（ISO 8601形式、例: 2025-01-15T17:00:00）またはnull",
  "priority": "高" or "中" or "低",
  "preferred_time": "午前" or "午後" or "夜" or null,
  "reasoning": "この推定の根拠（1-2文で簡潔に）"
}

推定ルール:
- 明示的に時間が書かれていない場合、タスクの性質から妥当な所要時間を推定（デフォルト60分）
- 「急ぎ」「至急」「今日中」→ priority: "高", deadline: 今日
- 「来週まで」→ deadline: 来週の月曜日
- 「朝やりたい」→ preferred_time: "午前"
- 不明な場合は priority: "中", deadline: null

reasoning記載ルール:
- 所要時間をなぜその値にしたか（例：「記事作成は構成・執筆・校正を含むため120分」）
- 優先度の判断理由（例：「締切が今日のため高優先」）
- 入力に時間や期限のヒントがあればそれを引用

今日の日付: ${new Date().toISOString().split('T')[0]}`;
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
    priority: result.priority,
    preferred_time: result.preferred_time,
    status: 'unassigned',
    reasoning: result.reasoning,
  }));
}
