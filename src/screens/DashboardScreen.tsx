// Screen 2: Dashboard - today/tomorrow events + unassigned tasks + "create proposal"
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { getUpcomingEvents } from '../services/calendar';
import { CalendarEvent, Screen, Task } from '../types';

interface Props {
  onNavigate: (screen: Screen) => void;
  tasks: Task[];
}

export function DashboardScreen({ onNavigate, tasks }: Props) {
  const { user, accessToken, logout } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEvents = useCallback(async () => {
    if (!accessToken) return;
    try {
      setError(null);
      const evts = await getUpcomingEvents(accessToken);
      setEvents(evts);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEvents();
  };

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayStr = today.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
  const tomorrowStr = tomorrow.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });

  const todayEvents = events.filter((e) => {
    const d = new Date(e.start.dateTime || e.start.date || '');
    return d.toDateString() === today.toDateString();
  });
  const tomorrowEvents = events.filter((e) => {
    const d = new Date(e.start.dateTime || e.start.date || '');
    return d.toDateString() === tomorrow.toDateString();
  });

  const unassignedTasks = tasks.filter((t) => t.status === 'unassigned');

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {user?.picture ? (
            <Image source={{ uri: user.picture }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarText}>{user?.name?.[0] || '?'}</Text>
            </View>
          )}
          <View>
            <Text style={styles.userName}>{user?.name || 'ユーザー'}</Text>
            <Text style={styles.userEmail}>{user?.email || ''}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onRefresh}
            disabled={refreshing}
          >
            <Text style={[styles.iconButtonText, refreshing && { opacity: 0.5 }]}>↻</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => onNavigate('settings')}
          >
            <Text style={styles.iconButtonText}>⚙</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={logout}>
            <Text style={styles.logoutText}>ログアウト</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={fetchEvents}>
              <Text style={styles.retryText}>再取得</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>カレンダーを読み込み中...</Text>
          </View>
        ) : (
          <>
            {/* Today */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>今日 - {todayStr}</Text>
              {todayEvents.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>予定なし</Text>
                </View>
              ) : (
                todayEvents.map((e) => <EventCard key={e.id} event={e} />)
              )}
            </View>

            {/* Tomorrow */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>明日 - {tomorrowStr}</Text>
              {tomorrowEvents.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>予定なし</Text>
                </View>
              ) : (
                tomorrowEvents.map((e) => <EventCard key={e.id} event={e} />)
              )}
            </View>

            {/* Unassigned tasks */}
            {unassignedTasks.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  未配置タスク ({unassignedTasks.length})
                </Text>
                {unassignedTasks.map((t) => (
                  <View key={t.id} style={styles.taskCard}>
                    <View style={styles.taskHeader}>
                      <Text style={styles.taskName}>{t.name}</Text>
                      <PriorityBadge priority={t.priority} />
                    </View>
                    <Text style={styles.taskDetail}>
                      {t.duration_minutes}分
                      {t.deadline ? ` | 締切: ${new Date(t.deadline).toLocaleDateString('ja-JP')}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Main action button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.mainButton}
          onPress={() => onNavigate('taskInput')}
        >
          <Text style={styles.mainButtonText}>タスクを入力して提案作成</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function EventCard({ event }: { event: CalendarEvent }) {
  const startTime = event.start.dateTime
    ? new Date(event.start.dateTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    : '終日';
  const endTime = event.end.dateTime
    ? new Date(event.end.dateTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <View style={styles.eventCard}>
      <View style={styles.eventTime}>
        <Text style={styles.eventTimeText}>{startTime}</Text>
        {endTime ? <Text style={styles.eventTimeSep}>-</Text> : null}
        {endTime ? <Text style={styles.eventTimeText}>{endTime}</Text> : null}
      </View>
      <Text style={styles.eventTitle}>{event.summary}</Text>
    </View>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const color = priority === '高' ? '#DC2626' : priority === '中' ? '#F59E0B' : '#6B7280';
  return (
    <View style={[styles.badge, { backgroundColor: color + '20', borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{priority}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 48,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  avatarPlaceholder: {
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  userName: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  userEmail: { fontSize: 12, color: '#64748B' },
  iconButton: {
    padding: 8,
    marginLeft: 4,
  },
  iconButtonText: { fontSize: 20 },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
  },
  logoutText: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  scroll: { flex: 1, padding: 16 },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: { color: '#DC2626', fontSize: 13, flex: 1 },
  retryText: { color: '#3B82F6', fontWeight: '600', fontSize: 13, marginLeft: 12 },
  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  loadingText: { marginTop: 12, color: '#64748B', fontSize: 14 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: '#FFF',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  emptyText: { color: '#94A3B8', fontSize: 14 },
  eventCard: {
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventTime: {
    marginRight: 14,
    alignItems: 'center',
    minWidth: 60,
  },
  eventTimeText: { fontSize: 13, color: '#3B82F6', fontWeight: '600' },
  eventTimeSep: { fontSize: 10, color: '#94A3B8' },
  eventTitle: { fontSize: 14, color: '#1E293B', flex: 1 },
  taskCard: {
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  taskName: { fontSize: 14, fontWeight: '600', color: '#1E293B', flex: 1 },
  taskDetail: { fontSize: 12, color: '#64748B' },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  footer: {
    padding: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  mainButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  mainButtonText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
});
