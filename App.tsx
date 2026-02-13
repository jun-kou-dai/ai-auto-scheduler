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
import { ProposalScreen } from './src/screens/ProposalScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { Screen, Task } from './src/types';

// Check env once at module load
const envResult = checkEnv();

function AppRouter() {
  const { user, onLogout } = useAuth();
  const [screen, setScreen] = useState<Screen>('login');
  const [tasks, setTasks] = useState<Task[]>([]);
  const prevUserRef = useRef(user);

  // Reset state when user logs out (BUG 18+19 fix)
  useEffect(() => {
    onLogout(() => {
      setScreen('login');
      setTasks([]);
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

  // Auto-redirect based on auth state
  const currentScreen = !user ? 'login' : screen === 'login' ? 'dashboard' : screen;

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
        />
      );
    case 'taskInput':
      return (
        <TaskInputScreen
          onNavigate={handleNavigate}
          onTasksAnalyzed={handleTasksAnalyzed}
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
  // Phase A2: If env is invalid, show missing keys (no crash)
  if (!envResult.ok) {
    return (
      <ErrorBoundary>
        <EnvError missing={envResult.missing} />
      </ErrorBoundary>
    );
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
