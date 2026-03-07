// === Data Types (Fixed per spec section 7) ===

export type Priority = '高' | '中' | '低';
export type PreferredTime = '午前' | '午後' | '夜' | null;
export type TaskStatus = 'unassigned' | 'scheduled';
export type Category = '仕事' | '勉強' | '運動' | '家事' | '買い物' | 'その他';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface TaskConfidence {
  duration: ConfidenceLevel;
  preferred_start: ConfidenceLevel;
  priority: ConfidenceLevel;
}

export interface Task {
  id: string;
  raw: string;
  name: string;
  description: string; // 元の入力内容の要約
  duration_minutes: number; // default 60
  deadline: string | null; // ISO string or null
  preferred_start: string | null; // ISO string: 「9時から」→ 固定開始時刻
  priority: Priority;
  preferred_time: PreferredTime;
  category: Category;
  status: TaskStatus;
  reasoning: string; // AI's reasoning for the estimates
  confidence?: TaskConfidence; // AI's confidence in each estimate
}

export interface ProposalEvent {
  taskId: string;
  title: string;
  start: string; // ISO string
  end: string; // ISO string
  warning?: string; // e.g. deadline exceeded
}

export interface UnassignedTask {
  taskId: string;
  reason: string;
}

export interface Proposal {
  events: ProposalEvent[];
  unassigned: UnassignedTask[];
}

// Google Calendar types
export interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  description?: string;
}

export interface BusySlot {
  start: string;
  end: string;
}

export interface FreeSlot {
  start: string;
  end: string;
  durationMinutes: number;
}

// Auth types
export interface UserInfo {
  name: string;
  email: string;
  picture: string;
}

// AI provider types
export type AIProvider = 'gemini' | 'claude';

// App screen type
export type Screen = 'login' | 'dashboard' | 'taskInput' | 'confirm' | 'proposal' | 'settings';
