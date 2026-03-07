// AI Auto Scheduler - Main App
// ErrorBoundary wraps everything (Phase A1)
// Env check runs at startup (Phase A2)
// State-based routing (Phase A3)
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { EnvError } from './src/components/EnvError';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { checkEnv } from './src/utils/envCheck';
import { LoginScreen } from './src/screens/LoginScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { TaskInputScreen } from './src/screens/TaskInputScreen';
import { ConfirmScreen } from './src/screens/ConfirmScreen';
import { ProposalScreen } from './src/screens/ProposalScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { Screen, Task } from './src/types';

// Check env once at module load
const envResult = checkEnv();

// Safe localStorage access (SSR-safe)
const STORAGE_KEY_TASKS = 'ai_scheduler_tasks';

function getStoredTasks(): Task[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(STORAGE_KEY_TASKS);
      if (stored) {
        const tasks = JSON.parse(stored);
        // Migrate old tasks missing new fields
        return tasks.map((t: any) => ({
          ...t,
          description: t.description || t.raw || t.name,
          category: t.category || 'その他',
        }));
      }
    }
  } catch { /* ignore */ }
  return [];
}

function storeTasks(tasks: Task[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
    }
  } catch { /* ignore */ }
}

function clearStoredTasks(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(STORAGE_KEY_TASKS);
    }
  } catch { /* ignore */ }
}

// Test mode: ?test=confirm bypasses auth and shows ConfirmScreen with mock data
function getTestMode(): Screen | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const test = params.get('test');
  if (test === 'confirm' || test === 'taskInput' || test === 'proposal') return test as Screen;
  return null;
}

function getTestTasks(): Task[] {
  const today = new Date().toISOString().split('T')[0];
  return [
    {
      id: 'test-1', raw: '今日の夜7時に野球観戦', name: '野球観戦',
      description: '野球観戦を楽しむ', duration_minutes: 120, deadline: null,
      preferred_start: `${today}T19:00:00`, priority: '中' as const,
      preferred_time: '夜' as const, category: 'その他' as const, status: 'unassigned' as const,
      reasoning: '野球観戦は通常2時間程度。夜7時という指定あり。',
      confidence: { duration: 'medium' as const, preferred_start: 'high' as const, priority: 'low' as const },
    },
    {
      id: 'test-2', raw: 'ちょっと掃除', name: '掃除',
      description: '軽い掃除', duration_minutes: 30, deadline: null,
      preferred_start: null, priority: '低' as const,
      preferred_time: null, category: '家事' as const, status: 'unassigned' as const,
      reasoning: '「ちょっと」という表現から短時間と推定。優先度低め。',
      confidence: { duration: 'low' as const, preferred_start: 'low' as const, priority: 'low' as const },
    },
    {
      id: 'test-3', raw: '18時から2時間読書', name: '読書',
      description: '読書に取り組む', duration_minutes: 120, deadline: null,
      preferred_start: `${today}T18:00:00`, priority: '中' as const,
      preferred_time: '夜' as const, category: '勉強' as const, status: 'unassigned' as const,
      reasoning: '「2時間」と明示的に指定。18時から開始。',
      confidence: { duration: 'high' as const, preferred_start: 'high' as const, priority: 'low' as const },
    },
  ];
}

function AppRouter() {
  const { user, accessToken, onLogout } = useAuth();
  const testMode = getTestMode();
  const [screen, setScreen] = useState<Screen>(testMode || 'login');
  const [tasks, setTasks] = useState<Task[]>(testMode ? getTestTasks : getStoredTasks);
  const prevUserRef = useRef(user);

  // Persist tasks to localStorage whenever they change
  useEffect(() => {
    storeTasks(tasks);
  }, [tasks]);

  // Reset state when user logs out (BUG 18+19 fix)
  useEffect(() => {
    onLogout(() => {
      setScreen('login');
      setTasks([]);
      clearStoredTasks();
    });
  }, [onLogout]);

  // When user becomes null (logged out), reset screen
  useEffect(() => {
    if (prevUserRef.current && !user) {
      setScreen('login');
      setTasks([]);
    }
    prevUserRef.current = user;
  }, [user]);

  // Auto-redirect based on auth state (check both user AND accessToken to prevent stale session)
  // Test mode bypasses auth check
  const currentScreen = testMode ? screen : (!user || !accessToken) ? 'login' : screen === 'login' ? 'dashboard' : screen;

  const handleNavigate = useCallback((s: Screen) => {
    setScreen(s);
  }, []);

  const handleTasksAnalyzed = useCallback((newTasks: Task[]) => {
    setTasks((prev) => [...prev, ...newTasks]);
  }, []);

  const handleTasksUpdated = useCallback((updatedTasks: Task[]) => {
    setTasks(updatedTasks);
  }, []);

  switch (currentScreen) {
    case 'login':
      return <LoginScreen />;
    case 'dashboard':
      return (
        <DashboardScreen
          onNavigate={handleNavigate}
          tasks={tasks}
          onTasksUpdated={handleTasksUpdated}
        />
      );
    case 'taskInput':
      return (
        <TaskInputScreen
          onNavigate={handleNavigate}
          onTasksAnalyzed={handleTasksAnalyzed}
        />
      );
    case 'confirm':
      return (
        <ConfirmScreen
          onNavigate={handleNavigate}
          tasks={tasks}
          onTasksUpdated={handleTasksUpdated}
        />
      );
    case 'proposal':
      return (
        <ProposalScreen
          onNavigate={handleNavigate}
          tasks={tasks}
          onTasksUpdated={handleTasksUpdated}
        />
      );
    case 'settings':
      return (
        <SettingsScreen
          onNavigate={handleNavigate}
        />
      );
    default:
      return <LoginScreen />;
  }
}

export default function App() {
  // Phase A2: Log missing env vars as warning, but don't block the app
  if (!envResult.ok) {
    console.warn('[ENV] Missing environment variables:', envResult.missing.join(', '));
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <View style={styles.container}>
          <AppRouter />
          <StatusBar style="auto" />
        </View>
      </AuthProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
});
