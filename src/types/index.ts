// === Data Types (Fixed per spec section 7) ===

export type Priority = '高' | '中' | '低';
export type PreferredTime = '午前' | '午後' | '夜' | null;
export type TaskStatus = 'unassigned' | 'scheduled';

export interface Task {
  id: string;
  raw: string;
  name: string;
  duration_minutes: number; // default 60
  deadline: string | null; // ISO string or null
  preferred_start: string | null; // ISO string: 「9時から」→ 固定開始時刻
  priority: Priority;
  preferred_time: PreferredTime;
  status: TaskStatus;
  reasoning: string; // AI's reasoning for the estimates
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
export type Screen = 'login' | 'dashboard' | 'taskInput' | 'proposal' | 'settings';
