// Phase D: AI analysis service (JSON only output)
// Abstracted to support both Gemini and Claude
// With regex fallback for AI failure resilience
import { Task, Category } from '../types';
import { nowJST, jstAddDays, jstToDate, toISODateString } from '../utils/timezone';

const AI_PROVIDER = process.env.EXPO_PUBLIC_AI_PROVIDER || 'gemini';
const AI_API_KEY = process.env.EXPO_PUBLIC_AI_API_KEY || '';
const GEMINI_PROXY_URL = 'https://ai-scheduler-proxy.netlify.app/.netlify/functions/gemini';

interface AITaskResult {
  name: string;
  description: string;
  duration_minutes: number;
  deadline: string | null;
  preferred_start: string | null;
  priority: '高' | '中' | '低';
  preferred_time: '午前' | '午後' | '夜' | null;
  category: Category;
  reasoning: string;
}

// ============================================================
// Title extraction: robust keyword extraction from voice input
// ============================================================
function extractTitle(input: string): string {
  let t = input;

  // 1. 時刻・日付表現を除去（順序重要: 所要時間→時刻の順で除去）
  t = t.replace(/(今日の?|明日の?|明後日の?|あさっての?|今から|今すぐ)/g, '');
  t = t.replace(/(午後|午前|夕方|夜|朝)は?/g, '');
  // 所要時間を先に除去（「1時間30分」→「1時」が時刻扱いされるのを防ぐ）
  t = t.replace(/\d{1,2}時間(\d{1,2}分)?/g, '');
  t = t.replace(/\d{1,2}分間?/g, '');
  // 時刻表現を除去（「9時に」「10時から」等）
  t = t.replace(/\d{1,2}時((\d{1,2})分|半)?(ごろ|頃)?(から|に|まで|までに)?/g, '');

  // 2. フィラー・接続詞除去
  t = t.replace(/(えっと|えーと|まあ|ちょっと|なんか|やっぱり|とりあえず|一応)/g, '');
  t = t.replace(/(なので|だから|ので|けど|けれど|から(?![\u3040-\u9fff]))/g, '|');

  // 3. 文の区切りを「|」に変換
  t = t.replace(/その後/g, '|');
  t = t.replace(/、/g, '|');
  t = t.replace(/(それから|それと|それで|そして|あと(?=\s)|あとは)/g, '|');

  // 4. 文末動詞パターンを除去（区切り「|」に置換）
  t = t.replace(/(を|に|が|は|で|と)?(行い|行な|おこない)ます/g, '|');
  t = t.replace(/(を|に|が)?(します|しました|したい(です)?|するつもり|する予定|する(?![たてな]))/g, '|');
  t = t.replace(/(を|に|が|は|で|と)?(行う|行った)(予定|つもり|こと)?/g, '|');
  t = t.replace(/(に|へ|を)?(行きます|行きたい(です)?|行く|向かいます|向かう|出かけます|出かける)/g, '|');
  t = t.replace(/(を|が)?(やります|やりたい(です)?|やる)/g, '|');
  t = t.replace(/(を|が)?(始めます|始める|終わらせます|終わらせる|終えます|終える)/g, '|');
  t = t.replace(/(を)?(浴びます|浴びる|浴びて)/g, '|');
  t = t.replace(/(を)?(買います|買う|買いに)/g, '|');
  t = t.replace(/(を)?(食べます|食べる|飲みます|飲む|読みます|読む|見ます|見る|聞きます|聞く|書きます|書く|作ります|作る|洗います|洗う)/g, '|');
  t = t.replace(/(に)?(励み|励め|頑張り|頑張れ|取り組み|努め)(ます|ました)?/g, '|');
  t = t.replace(/(ます|ました|ません)/g, '|');
  t = t.replace(/(です|でした)/g, '|');

  // 5. 区切りで分割してキーワード抽出
  const segments = t.split('|');
  const keywords: string[] = [];

  for (let seg of segments) {
    seg = seg.replace(/\s+/g, '').trim();
    if (!seg) continue;

    // 移動表現除去: 「職場に行って」→ 除去
    seg = seg.replace(/.{1,6}(に行って|へ行って|に向かって|へ向かって)/g, '');

    // 「〜て」接続を分割して各部分を処理
    const teParts = seg.split(/(?<=[\u3040-\u9fff]{2,})て(?=[\u3040-\u9fff]{2,})/);
    if (teParts.length > 1) {
      const cleanedParts: string[] = [];
      for (let part of teParts) {
        // 「Xする」系の動詞語幹を除去（「出発し」→「出発」「練習し」→「練習」）
        part = part.replace(/(?<=[\u4e00-\u9fff]{2,})し$/g, '');
        if (part && part.length > 0) cleanedParts.push(part);
      }
      seg = cleanedParts.join(' / ');
    }

    // 末尾の動詞語幹・て形を除去
    seg = seg.replace(/(して|って|て)$/g, '');
    seg = seg.replace(/(を|が)?(買い|売り|洗い|浴び|書き|読み|飲み|食べ|見|聞き|作り)$/g, '');

    // 助詞+動詞語幹の残骸を除去
    seg = seg.replace(/(を|に)(し|やり|行い|行ない|励み|頑張り|取り組み|努め)$/g, '');

    // 末尾・先頭の助詞除去
    seg = seg.replace(/(を|に|が|は|で|と|も|へ)$/g, '');
    seg = seg.replace(/^(を|に|が|は|で|と|も|へ|の|それ|これ|あれ|ら|。|\s|、)+/g, '');

    seg = seg.trim();
    if (seg && seg.length > 0) {
      keywords.push(seg);
    }
  }

  // 重複除去
  const unique = [...new Set(keywords)];
  const result = unique.join(' / ');
  return result || input.trim();
}

// ============================================================
// Multi-task line splitter for voice input
// ============================================================
// Splits "18時から30分間読書で19時からバイブコーディング" into
// ["18時から30分間読書", "19時からバイブコーディング"]
function splitMultiTaskLine(line: string): string[] {
  // Split on conjunctions/particles followed by time expressions
  const result = line.split(/(?:で|、|。|それから|それと|そして|あとは?|その後)\s*(?=(?:午前|午後|夕方|夜|朝)?\d{1,2}時)/);
  const filtered = result.map(s => s.trim()).filter(s => s.length > 0);
  return filtered.length > 0 ? filtered : [line];
}

// ============================================================
// Regex-based fallback parser (AI failure resilience)
// ============================================================
function createFallbackAnalysis(input: string): AITaskResult {
  const jst = nowJST();

  // 日付パース: 「明日」「明後日」「あさって」
  let dayOffset = 0;
  if (/明後日|あさって/.test(input)) dayOffset = 2;
  else if (/明日/.test(input)) dayOffset = 1;

  // 時刻パース: 「9時」「14時45分」「4時半」（「1時間」は除外）
  let preferredStart: string | null = null;
  const timeRe = /(午後|午前|夕方|夜)?(\d{1,2})時(?!間)((\d{1,2})分(?!間)|半)?/;
  const tm = input.match(timeRe);
  let startHour = 0, startMin = 0;
  if (tm) {
    startHour = parseInt(tm[2], 10);
    const prefix = tm[1];
    startMin = tm[3] === '半' ? 30 : tm[4] ? parseInt(tm[4], 10) : 0;
    if (prefix === '午後' || prefix === '夕方' || prefix === '夜') {
      if (startHour < 12) startHour += 12;
    }
    const d = jstAddDays(jst.year, jst.month, jst.day, dayOffset);
    const dateStr = toISODateString(d.year, d.month, d.day);

    // 「〜まで」が付いている場合はdeadlineとして扱う（preferred_startにしない）
    if (!/まで/.test(input.slice(input.indexOf(tm[0])))) {
      preferredStart = `${dateStr}T${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}:00`;
    }
  }

  // 終了時刻パース: 「6時まで」「8時半まで」
  const endMatch = input.match(/(\d{1,2})時(半|(\d{1,2})分)?まで/);
  let endMinutesOfDay: number | null = null;
  if (endMatch) {
    const endH = parseInt(endMatch[1], 10);
    const endM = endMatch[2] === '半' ? 30 : endMatch[3] ? parseInt(endMatch[3], 10) : 0;
    endMinutesOfDay = endH * 60 + endM;
  }

  // 所要時間パース
  let durationMinutes = 60;
  const timeStr = tm ? tm[0] : '';
  const endStr = endMatch ? endMatch[0] : '';
  let inputClean = timeStr ? input.replace(timeStr, '') : input;
  if (endStr) inputClean = inputClean.replace(endStr, '');
  const durHourMatch = inputClean.match(/(\d+)時間/);
  const durHalfMatch = /時間半/.test(inputClean);
  const durMinMatch = inputClean.match(/(\d+)分/);
  if (durHourMatch) {
    durationMinutes = parseInt(durHourMatch[1], 10) * 60;
    if (durHalfMatch) durationMinutes += 30;
    else if (durMinMatch) durationMinutes += parseInt(durMinMatch[1], 10);
  } else if (durMinMatch) {
    durationMinutes = parseInt(durMinMatch[1], 10);
  } else if (endMinutesOfDay !== null && tm) {
    const startMOD = startHour * 60 + startMin;
    const diff = endMinutesOfDay - startMOD;
    if (diff > 0) durationMinutes = diff;
  }

  // カテゴリ推定
  let category: Category = 'その他';
  if (/トレーニング|運動|ジム|ランニング|散歩|筋トレ|ストレッチ|ヨガ/.test(input)) category = '運動';
  else if (/会議|仕事|ミーティング|打ち合わせ|資料|メール|報告/.test(input)) category = '仕事';
  else if (/勉強|学習|読書|復習|宿題|レポート|コーディング/.test(input)) category = '勉強';
  else if (/掃除|洗濯|料理|片付け|ゴミ|風呂|シャワー/.test(input)) category = '家事';
  else if (/買い物|スーパー|コンビニ|ショッピング/.test(input)) category = '買い物';

  // 優先度推定
  let priority: '高' | '中' | '低' = '中';
  if (/急ぎ|至急|今日中|すぐ|大事|重要|絶対|マスト/.test(input)) priority = '高';
  else if (/できれば|そのうち|暇な時|余裕あれば|いつでもいい/.test(input)) priority = '低';

  // preferred_time推定
  let preferredTime: '午前' | '午後' | '夜' | null = null;
  if (/朝|午前/.test(input)) preferredTime = '午前';
  else if (/午後|昼/.test(input)) preferredTime = '午後';
  else if (/夜|夕方/.test(input)) preferredTime = '夜';

  // タイトル: 強力なキーワード抽出
  const title = extractTitle(input);

  return {
    name: title,
    description: input.trim(),
    duration_minutes: durationMinutes,
    deadline: null,
    preferred_start: preferredStart,
    priority,
    preferred_time: preferredTime,
    category,
    reasoning: 'フォールバック: AIが利用できないため、正規表現で解析しました',
  };
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

  // Additional dates for ambiguous expressions
  const dat = jstAddDays(jst.year, jst.month, jst.day, 2);
  const dayAfterTomorrowISO = toISODateString(dat.year, dat.month, dat.day);
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const todayDayName = dayNames[dayOfWeek];

  // This week's remaining weekdays
  const weekdayDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = jstAddDays(jst.year, jst.month, jst.day, i);
    const dISO = toISODateString(d.year, d.month, d.day);
    const dDay = (dayOfWeek + i) % 7;
    weekdayDates.push(`${dayNames[dDay]}曜=${dISO}`);
  }

  // This weekend (Saturday)
  const daysToSat = dayOfWeek <= 6 ? (6 - dayOfWeek) : 0;
  const sat = jstAddDays(jst.year, jst.month, jst.day, daysToSat);
  const weekendISO = toISODateString(sat.year, sat.month, sat.day);

  // End of month
  const lastDay = new Date(Date.UTC(jst.year, jst.month + 1, 0)).getUTCDate();
  const endOfMonthISO = toISODateString(jst.year, jst.month, lastDay);

  // Current hour for context
  const currentHour = jst.hours;

  return `あなたはタスク分析AIです。ユーザーが入力した複数のタスクを構造化してください。
音声入力が主な入力方法のため、話し言葉・カジュアルな表現・曖昧な指示に柔軟に対応してください。

必ず以下のJSON配列だけを返してください。余計な文章・マークダウン・説明は一切禁止です。

重要: 1行に複数のタスクが含まれている場合は、タスクごとに分割して別々のオブジェクトを返してください。区切りの手がかり: 複数の時刻表現、「それから」「あと」「で」+新しい活動。入力行数と出力数は一致しなくて構いません。

各タスクの形式:
{
  "name": "タスク名（簡潔な名詞句）",
  "description": "元の入力内容を自然な日本語で要約（何をするか・補足情報）",
  "duration_minutes": 所要時間（分、数値）,
  "deadline": "締切日時（ISO 8601形式）またはnull",
  "preferred_start": "開始希望日時（ISO 8601形式）またはnull",
  "priority": "高" or "中" or "低",
  "preferred_time": "午前" or "午後" or "夜" or null,
  "category": "仕事" or "勉強" or "運動" or "家事" or "買い物" or "その他",
  "reasoning": "この推定の根拠（1-2文で簡潔に）"
}

=== タスク名のルール（最重要） ===
- 名詞・名詞句のみ。動詞・文末表現・助詞で終わらないこと。
- ユーザーが言った固有名詞・専門用語・カタカナ語はそのまま保持。
- 「〜します」「〜したい」「〜に行く」等の動詞は除去し、核となるキーワードだけ残す。
- 複数のタスクが1行に含まれる場合は「/」で区切る。
- 例:
  「バイブコーディングをします」→ name: "バイブコーディング"
  「床屋に行きたい」→ name: "床屋"
  「午後は職場に行って仕事をします」→ name: "仕事"
  「瞑想をします それから着替えて職場に向かいます」→ name: "瞑想 / 着替え / 出勤"
  「筋トレとヨガをやります」→ name: "筋トレ / ヨガ"
  「ストレッチをして柔軟に励みます」→ name: "ストレッチ / 柔軟体操"
  「20時からランニングを行う予定です」→ name: "ランニング"
- 音声認識の誤変換が明らかな場合のみ、最小限の修正を許可（例: 「ばいぶこーでぃんぐ」→「バイブコーディング」）

=== description（詳細）のルール ===
- ユーザーが言った内容を自然で簡潔な文にまとめる。時刻や所要時間の情報は含めない。
- 例:
  「バイブコーディング、またはアンチグラビティの勉強をする予定」
  「ストレッチと柔軟体操を行う」
  「ランニングで体を動かす」

=== category（カテゴリ）のルール ===
- 仕事: 会議、ミーティング、打ち合わせ、資料作成、メール、報告、仕事全般
- 勉強: 学習、読書、復習、宿題、レポート、コーディング、プログラミング
- 運動: トレーニング、ジム、ランニング、散歩、筋トレ、ストレッチ、ヨガ、スポーツ
- 家事: 掃除、洗濯、料理、片付け、ゴミ出し、風呂、シャワー
- 買い物: スーパー、コンビニ、ショッピング、買い出し
- その他: 上記に当てはまらないもの

=== 現在の日時情報 ===
今日: ${todayISO}（${todayDayName}曜日）、現在時刻: ${currentHour}時台
明日: ${tomorrowISO}
あさって: ${dayAfterTomorrowISO}
今週末（土曜）: ${weekendISO}
来週月曜日: ${nextMondayISO}
月末: ${endOfMonthISO}
今週の曜日対応: ${weekdayDates.join(', ')}

=== 日付の解析ルール（重要） ===

基本的な日付:
- 「今日」「今日中」→ deadline: "${todayISO}T23:59:00"
- 「明日」「明日まで」→ deadline: "${tomorrowISO}T23:59:00"
- 「あさって」「明後日」→ deadline: "${dayAfterTomorrowISO}T23:59:00"
- 「しあさって」→ 3日後の日付を計算
- 「来週」「来週まで」→ deadline: "${nextMondayISO}T23:59:00"
- 「今週中」「今週いっぱい」→ deadline: "${weekendISO}T23:59:00"
- 「今週末」「週末」→ deadline: "${weekendISO}T23:59:00", preferred_time: null
- 「月末」「月末まで」→ deadline: "${endOfMonthISO}T23:59:00"
- 「来月」→ 来月1日を計算してdeadlineに設定

相対的な日付:
- 「N日後」「N日以内」→ 今日からN日後の日付を計算
- 「N週間後」「N週間以内」→ 今日からN×7日後
- 「3日後まで」→ 3日後のT23:59:00

曜日指定:
- 「金曜まで」「金曜日まで」→ 今週の曜日対応表から金曜の日付を使用
- 「来週の水曜」→ 来週の水曜日を計算
- 過去の曜日が指定された場合は来週のその曜日とする

=== 「〜から」と「〜まで」の区別（最重要） ===
「〜からXXする」「〜時にXXする」→ 開始時刻の指定。preferred_startに設定し、deadlineはnull。
「〜までにXXする」「〜まで」→ 締切の指定。deadlineに設定し、preferred_startはnull。

例:
- 「今日の9時からトレーニング」→ preferred_start: "${todayISO}T09:00:00", deadline: null
- 「明日10時からミーティング」→ preferred_start: "${tomorrowISO}T10:00:00", deadline: null
- 「15時に会議」→ preferred_start: "${todayISO}T15:00:00", deadline: null
- 「あさっての朝イチで打ち合わせ」→ preferred_start: "${dayAfterTomorrowISO}T09:00:00", deadline: null
- 「今日の15時まで」「15時までに」→ deadline: "${todayISO}T15:00:00", preferred_start: null
- 「9時まで」→ deadline: "${todayISO}T09:00:00", preferred_start: null

=== 曖昧な時刻表現の変換ルール ===

開始時刻の曖昧表現（→ preferred_start）:
- 「朝イチ」「朝一」「一番に」→ T09:00:00
- 「午前中」→ preferred_time: "午前"（preferred_startは設定しない）
- 「午後イチ」「午後一」「昼イチ」→ T13:00:00
- 「昼過ぎ」「昼から」→ T13:00:00
- 「昼前」→ T11:00:00
- 「夕方」「夕方から」→ T17:00:00
- 「夜」「夜から」→ T19:00:00
- 「寝る前」→ T22:00:00
- 「お昼に」「ランチの時間」→ T12:00:00

締切の曖昧表現（→ deadline）:
- 「今日の15時まで」「今日15時まで」→ deadline: "${todayISO}T15:00:00"
- 「明日の10時まで」→ deadline: "${tomorrowISO}T10:00:00"
- 「午後3時まで」→ deadline: 当日または翌日のT15:00:00
- 「夕方6時まで」→ deadline: 当日のT18:00:00
- 「昼まで」「お昼まで」→ deadline: 当日のT12:00:00
- 「夕方まで」→ deadline: 当日のT17:00:00
- 「夜まで」→ deadline: 当日のT19:00:00
- 「今日中」→ deadline: "${todayISO}T23:59:00"

時間帯の変換:
- 「朝」「午前中」「朝やりたい」「朝イチ」→ preferred_time: "午前"
- 「昼」「午後」「昼にやる」「午後イチ」→ preferred_time: "午後"
- 「夜」「夜にやる」「夕方以降」「夕方」→ preferred_time: "夜"

=== 優先度の変換 ===
- 「急ぎ」「至急」「今日中」「すぐ」「大事」「重要」「絶対」「マスト」→ priority: "高"
- 「できれば」「そのうち」「暇な時」「余裕あれば」「いつでもいい」→ priority: "低"
- 不明な場合は priority: "中"

=== 所要時間の推定ルール ===

明示的な時間:
- 「2時間」→ 120, 「30分」→ 30, 「1時間半」→ 90
- 「30分くらい」「1時間ほど」「2時間弱」→ そのまま読み取る
- 「半日」→ 240（4時間）, 「丸一日」→ 480（8時間）

曖昧な時間表現:
- 「ちょっと」「さくっと」「ささっと」「すぐ終わる」→ 15〜20分
- 「しっかり」「がっつり」「じっくり」→ 120〜180分
- 「軽く」「ちょこっと」→ 15〜30分

タスク種別からの推定（明示的な時間指定がない場合）:
- メール返信・確認系 → 15〜30分
- 電話・連絡 → 15分
- ミーティング・打ち合わせ → 60分
- 資料作成・レポート → 90〜120分
- 買い物・外出 → 60分
- トレーニング・運動 → 60〜90分
- 掃除・片付け → 30〜60分
- 勉強・読書 → 60分
- 料理・食事準備 → 45分
- その他 → 60分（デフォルト）

=== 音声認識の誤変換への対応 ===
音声入力では以下のような誤変換が起きやすい。文脈から正しい意味を推測すること:
- 「トレーニング」↔「トレイニング」
- 「ミーティング」↔「見ーティング」
- 「プレゼン」↔「プレ全」
- 「あさって」↔「明後日」↔「アサッテ」
- 数字の聞き間違い:「15時」↔「5時」（文脈で判断）
- 句読点なしの連続入力:「明日の3時からミーティング1時間くらい」→ 適切に分割
- 「それから」「あと」「あとは」→ タスクの区切りとして扱う（複数タスクに分割）

reasoning記載ルール:
- 所要時間をなぜその値にしたか
- 優先度の判断理由
- 曖昧な表現をどう解釈したか
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
  const VALID_CATEGORIES: Category[] = ['仕事', '勉強', '運動', '家事', '買い物', 'その他'];
  return {
    name: typeof item.name === 'string' ? item.name : '不明なタスク',
    description: typeof item.description === 'string' ? item.description : '',
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
    category: VALID_CATEGORIES.includes(item.category) ? item.category : 'その他',
    reasoning: typeof item.reasoning === 'string' ? item.reasoning : '',
  };
}

// Gemini API call via server-side proxy (API key is stored on proxy server)
async function callGemini(taskText: string): Promise<string> {
  const prompt = buildSystemPrompt();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(GEMINI_PROXY_URL, {
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
// Falls back to regex parser on AI failure
export async function analyzeTasks(rawInput: string): Promise<Task[]> {
  const lines = rawInput
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    throw new Error('タスクが入力されていません');
  }

  const taskText = lines.join('\n');

  try {
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
      description: result.description || (index < lines.length ? lines[index] : result.name),
      duration_minutes: result.duration_minutes,
      deadline: result.deadline,
      preferred_start: result.preferred_start,
      priority: result.priority,
      preferred_time: result.preferred_time,
      category: result.category,
      status: 'unassigned',
      reasoning: result.reasoning,
    }));
  } catch (err: any) {
    // AI失敗時: 自動でregexフォールバック（エラー画面を出さない）
    console.warn('[AI分析失敗] フォールバックを使用:', err.message || err);

    let taskIndex = 0;
    return lines.flatMap((line): Task[] => {
      const subLines = splitMultiTaskLine(line);
      return subLines.map((subLine): Task => {
        const fallback = createFallbackAnalysis(subLine);
        const idx = taskIndex++;
        return {
          id: `task-${Date.now()}-${idx}`,
          raw: subLine,
          name: fallback.name,
          description: fallback.description,
          duration_minutes: fallback.duration_minutes,
          deadline: fallback.deadline,
          preferred_start: fallback.preferred_start,
          priority: fallback.priority,
          preferred_time: fallback.preferred_time,
          category: fallback.category,
          status: 'unassigned',
          reasoning: fallback.reasoning,
        };
      });
    });
  }
}
