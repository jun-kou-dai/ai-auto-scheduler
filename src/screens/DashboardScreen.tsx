// Screen 2: Dashboard - today/tomorrow events (tappable + editable) + unassigned tasks
// Time-aware display: past events dimmed, current event highlighted, now indicator
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
import { getUpcomingEvents, updateCalendarEvent, deleteCalendarEvent, CalendarApiError } from '../services/calendar';
import { CalendarEvent, Screen, Task } from '../types';
import { TaskEditModal } from '../components/TaskEditModal';
import { CalendarEventEditModal } from '../components/CalendarEventEditModal';
import { nowJST, jstToDate } from '../utils/timezone';

interface Props {
  onNavigate: (screen: Screen) => void;
  tasks: Task[];
  onTasksUpdated: (tasks: Task[]) => void;
}

export function DashboardScreen({ onNavigate, tasks, onTasksUpdated }: Props) {
  const { user, accessToken, logout } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Event expand/edit state
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  // Task expand/edit state
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Current time state (updates every 30 seconds for time-aware display)
  const [now, setNow] = useState(new Date());


  const fetchEvents = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const evts = await getUpcomingEvents(accessToken);
      setEvents(evts);
    } catch (err) {
      if (err instanceof CalendarApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, logout]);

  // Fetch events on mount + delayed re-fetch to catch recently created events
  useEffect(() => {
    fetchEvents();
    const timer = setTimeout(fetchEvents, 2000);
    return () => clearTimeout(timer);
  }, [fetchEvents]);

  // Keep current time updated every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Auto-refresh events every 5 minutes
  useEffect(() => {
    const timer = setInterval(() => {
      if (accessToken) fetchEvents();
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [accessToken, fetchEvents]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEvents();
  };

  const jst = nowJST();
  const today = jstToDate(jst.year, jst.month, jst.day);
  const tomorrow = jstToDate(jst.year, jst.month, jst.day + 1);

  const todayStr = today.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' });
  const tomorrowStr = tomorrow.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' });

  const todayStart = today.getTime();
  const tomorrowStart = tomorrow.getTime();
  const dayAfterStart = jstToDate(jst.year, jst.month, jst.day + 2).getTime();

  const todayEvents = events.filter((e) => {
    const t = new Date(e.start.dateTime || e.start.date || '').getTime();
    return t >= todayStart && t < tomorrowStart;
  });
  const tomorrowEvents = events.filter((e) => {
    const t = new Date(e.start.dateTime || e.start.date || '').getTime();
    return t >= tomorrowStart && t < dayAfterStart;
  });

  // Event status helper (past / current / upcoming)
  const getEventStatus = (event: CalendarEvent): 'past' | 'current' | 'upcoming' => {
    // All-day events shown in today are always "current"
    if (!event.start?.dateTime && event.start?.date) return 'current';

    const startStr = event.start?.dateTime;
    const endStr = event.end?.dateTime;
    if (!startStr || !endStr) return 'upcoming';

    const startMs = new Date(startStr).getTime();
    const endMs = new Date(endStr).getTime();
    if (isNaN(startMs) || isNaN(endMs)) return 'upcoming';

    const nowTime = now.getTime();
    if (endMs <= nowTime) return 'past';
    if (startMs <= nowTime) return 'current';
    return 'upcoming';
  };

  // Current time string in JST
  const currentTimeStr = now.toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Now indicator position for today's events
  const nowMs = now.getTime();
  let nowInsertIndex = todayEvents.length;
  for (let i = 0; i < todayEvents.length; i++) {
    const eventStart = new Date(todayEvents[i].start.dateTime || todayEvents[i].start.date || '').getTime();
    if (eventStart > nowMs) {
      nowInsertIndex = i;
      break;
    }
  }

  // Today's event stats
  const todayPastCount = todayEvents.filter(e => getEventStatus(e) === 'past').length;
  const todayRemainingCount = todayEvents.length - todayPastCount;

  // Calendar event edit handlers
  const handleEventSave = async (
    eventId: string,
    updates: { summary?: string; start?: string; end?: string; description?: string }
  ) => {
    if (!accessToken) return;
    try {
      await updateCalendarEvent(accessToken, eventId, updates);
      setEditingEvent(null);
      setExpandedEventId(null);
      fetchEvents();
    } catch (err) {
      if (err instanceof CalendarApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleEventDelete = async (eventId: string) => {
    if (!accessToken) return;
    try {
      await deleteCalendarEvent(accessToken, eventId);
      setEditingEvent(null);
      setExpandedEventId(null);
      fetchEvents();
    } catch (err) {
      if (err instanceof CalendarApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Task edit handlers
  const unassignedTasks = tasks.filter((t) => t.status === 'unassigned');

  const toggleExpandEvent = (eventId: string) => {
    setExpandedEventId((prev) => (prev === eventId ? null : eventId));
  };

  const toggleExpandTask = (taskId: string) => {
    setExpandedTaskId((prev) => (prev === taskId ? null : taskId));
  };

  const handleSaveTaskEdit = (updated: Task) => {
    const newTasks = tasks.map((t) => (t.id === updated.id ? updated : t));
    onTasksUpdated(newTasks);
    setEditingTask(null);
    setExpandedTaskId(null);
  };

  const handleDeleteTask = (taskId: string) => {
    const newTasks = tasks.filter((t) => t.id !== taskId);
    onTasksUpdated(newTasks);
    setExpandedTaskId(null);
  };


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
            {/* Unassigned tasks notification banner */}
            {unassignedTasks.length > 0 && (
              <TouchableOpacity
                style={styles.unassignedBanner}
                onPress={() => onNavigate('proposal')}
                activeOpacity={0.7}
              >
                <View style={styles.unassignedBannerContent}>
                  <View>
                    <Text style={styles.unassignedBannerTitle}>
                      {unassignedTasks.length}件の未配置タスク
                    </Text>
                    <Text style={styles.unassignedBannerSub}>
                      タップしてスケジュールに配置
                    </Text>
                  </View>
                  <Text style={styles.unassignedBannerArrow}>→</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Today */}
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>{todayStr}</Text>
                <Text style={styles.currentTimeText}>{currentTimeStr}</Text>
              </View>
              {todayEvents.length > 0 && (
                <Text style={styles.sectionHint}>
                  {todayPastCount === todayEvents.length
                    ? '本日の予定はすべて終了しました'
                    : todayPastCount > 0
                    ? `${todayPastCount}件終了 ・ 残り${todayRemainingCount}件`
                    : 'タップで詳細・編集'}
                </Text>
              )}
              {todayEvents.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>予定なし</Text>
                </View>
              ) : (
                <>
                  {todayEvents.map((e, idx) => {
                    const status = getEventStatus(e);
                    return (
                      <React.Fragment key={e.id}>
                        {idx === nowInsertIndex && <NowIndicator time={currentTimeStr} />}
                        <EventCard
                          event={e}
                          status={status}
                          isExpanded={expandedEventId === e.id}
                          onToggle={() => toggleExpandEvent(e.id)}
                          onEdit={() => setEditingEvent({ ...e })}
                        />
                      </React.Fragment>
                    );
                  })}
                  {nowInsertIndex === todayEvents.length && <NowIndicator time={currentTimeStr} />}
                </>
              )}
            </View>

            {/* Tomorrow */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{tomorrowStr}</Text>
              {tomorrowEvents.length > 0 && (
                <Text style={styles.sectionHint}>タップで詳細・編集</Text>
              )}
              {tomorrowEvents.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>予定なし</Text>
                </View>
              ) : (
                tomorrowEvents.map((e) => (
                  <EventCard
                    key={e.id}
                    event={e}
                    isExpanded={expandedEventId === e.id}
                    onToggle={() => toggleExpandEvent(e.id)}
                    onEdit={() => setEditingEvent({ ...e })}
                  />
                ))
              )}
            </View>

            {/* Unassigned tasks detail section */}
            {unassignedTasks.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  未配置タスク ({unassignedTasks.length})
                </Text>
                <Text style={styles.sectionHint}>タップで詳細・編集</Text>
                {unassignedTasks.map((t) => {
                  const isExpanded = expandedTaskId === t.id;
                  return (
                    <View key={t.id} style={[styles.taskCard, isExpanded && styles.taskCardExpanded]}>
                      <TouchableOpacity
                        onPress={() => toggleExpandTask(t.id)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.taskHeader}>
                          <Text style={styles.taskName}>{t.name}</Text>
                          <View style={styles.taskHeaderRight}>
                            <PriorityBadge priority={t.priority} />
                            <Text style={styles.expandArrow}>{isExpanded ? '▲' : '▼'}</Text>
                          </View>
                        </View>
                        <Text style={styles.taskDetail}>
                          {t.duration_minutes}分
                          {t.deadline ? ` | 締切: ${new Date(t.deadline).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })}` : ''}
                          {t.preferred_time ? ` | ${t.preferred_time}希望` : ''}
                        </Text>
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={styles.taskExpanded}>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>元の入力:</Text>
                            <Text style={styles.detailValue}>「{t.raw}」</Text>
                          </View>

                          {t.reasoning ? (
                            <View style={styles.reasoningBox}>
                              <Text style={styles.reasoningLabel}>AI推定の根拠:</Text>
                              <Text style={styles.reasoningText}>{t.reasoning}</Text>
                            </View>
                          ) : null}

                          <View style={styles.detailGrid}>
                            <View style={styles.detailItem}>
                              <Text style={styles.detailLabel}>所要時間</Text>
                              <Text style={styles.detailValue}>{t.duration_minutes}分</Text>
                            </View>
                            <View style={styles.detailItem}>
                              <Text style={styles.detailLabel}>優先度</Text>
                              <Text style={styles.detailValue}>{t.priority}</Text>
                            </View>
                            <View style={styles.detailItem}>
                              <Text style={styles.detailLabel}>締切</Text>
                              <Text style={styles.detailValue}>
                                {t.deadline ? new Date(t.deadline).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : 'なし'}
                              </Text>
                            </View>
                            <View style={styles.detailItem}>
                              <Text style={styles.detailLabel}>希望時間帯</Text>
                              <Text style={styles.detailValue}>{t.preferred_time || 'なし'}</Text>
                            </View>
                          </View>

                          <View style={styles.taskActionRow}>
                            <TouchableOpacity
                              style={styles.deleteButton}
                              onPress={() => handleDeleteTask(t.id)}
                            >
                              <Text style={styles.deleteButtonText}>削除</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.editButton, { flex: 1 }]}
                              onPress={() => setEditingTask({ ...t })}
                            >
                              <Text style={styles.editButtonText}>編集する</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* Schedule unassigned tasks button */}
                <TouchableOpacity
                  style={styles.scheduleButton}
                  onPress={() => onNavigate('proposal')}
                >
                  <Text style={styles.scheduleButtonText}>
                    {unassignedTasks.length}件のタスクをスケジュールする
                  </Text>
                </TouchableOpacity>
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

      {/* Calendar Event Edit Modal */}
      {editingEvent && (
        <CalendarEventEditModal
          key={editingEvent.id}
          event={editingEvent}
          onSave={handleEventSave}
          onDelete={handleEventDelete}
          onCancel={() => setEditingEvent(null)}
        />
      )}

      {/* Task Edit Modal */}
      {editingTask && (
        <TaskEditModal
          key={editingTask.id}
          task={editingTask}
          onSave={handleSaveTaskEdit}
          onCancel={() => setEditingTask(null)}
        />
      )}
    </View>
  );
}

// --- Now Indicator (red line showing current time) ---

function NowIndicator({ time }: { time: string }) {
  return (
    <View style={styles.nowIndicator}>
      <View style={styles.nowDot} />
      <View style={styles.nowLine} />
      <Text style={styles.nowText}>現在 {time}</Text>
    </View>
  );
}

// --- Event Card with time-aware status ---

function EventCard({
  event,
  status,
  isExpanded,
  onToggle,
  onEdit,
}: {
  event: CalendarEvent;
  status?: 'past' | 'current' | 'upcoming';
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const startTime = event.start.dateTime
    ? new Date(event.start.dateTime).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })
    : '終日';
  const endTime = event.end.dateTime
    ? new Date(event.end.dateTime).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })
    : '';

  const durationMin =
    event.start.dateTime && event.end.dateTime
      ? Math.round((new Date(event.end.dateTime).getTime() - new Date(event.start.dateTime).getTime()) / 60000)
      : null;

  const isPast = status === 'past';
  const isCurrent = status === 'current';

  return (
    <View style={[
      styles.eventCard,
      isExpanded && styles.eventCardExpanded,
      isPast && styles.eventCardPast,
      isCurrent && styles.eventCardCurrent,
    ]}>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.7}>
        <View style={styles.eventCardHeader}>
          <View style={styles.eventTime}>
            <Text style={[styles.eventTimeText, isPast && styles.textPast]}>
              {startTime}
            </Text>
            {endTime ? <Text style={[styles.eventTimeSep, isPast && styles.textPast]}>-</Text> : null}
            {endTime ? <Text style={[styles.eventTimeText, isPast && styles.textPast]}>
              {endTime}
            </Text> : null}
          </View>
          <Text
            style={[styles.eventTitle, isPast && styles.textPast]}
            numberOfLines={isExpanded ? undefined : 1}
          >
            {event.summary}
          </Text>
          {isPast && <Text style={styles.pastBadge}>済</Text>}
          {isCurrent && (
            <View style={styles.currentBadge}>
              <Text style={styles.currentBadgeText}>進行中</Text>
            </View>
          )}
          <Text style={styles.expandArrow}>{isExpanded ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.eventExpanded}>
          {durationMin != null && (
            <View style={styles.eventDetailRow}>
              <Text style={styles.detailLabel}>所要時間</Text>
              <Text style={styles.detailValue}>{durationMin}分</Text>
            </View>
          )}
          {event.description ? (
            <View style={styles.eventDescBox}>
              <Text style={styles.detailLabel}>メモ</Text>
              <Text style={styles.eventDescText}>{event.description}</Text>
            </View>
          ) : null}
          <TouchableOpacity style={styles.editButton} onPress={onEdit}>
            <Text style={styles.editButtonText}>編集する</Text>
          </TouchableOpacity>
        </View>
      )}
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

  // Section title with current time
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  currentTimeText: {
    fontSize: 13,
    color: '#EF4444',
    fontWeight: '700',
  },
  sectionHint: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 8,
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

  // Unassigned tasks notification banner
  unassignedBanner: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  unassignedBannerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  unassignedBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#C2410C',
  },
  unassignedBannerSub: {
    fontSize: 12,
    color: '#EA580C',
    marginTop: 2,
  },
  unassignedBannerArrow: {
    fontSize: 20,
    color: '#EA580C',
    fontWeight: '700',
  },

  // Now indicator
  nowIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
    paddingHorizontal: 2,
  },
  nowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  nowLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#EF4444',
    marginLeft: 4,
    marginRight: 6,
  },
  nowText: {
    fontSize: 11,
    color: '#EF4444',
    fontWeight: '700',
  },

  // Event card styles (interactive + status-aware)
  eventCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    padding: 14,
  },
  eventCardExpanded: {
    borderColor: '#3B82F6',
    borderWidth: 1.5,
  },
  eventCardPast: {
    opacity: 0.55,
    backgroundColor: '#F8FAFC',
  },
  eventCardCurrent: {
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  textPast: {
    color: '#94A3B8',
  },
  pastBadge: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
    marginRight: 4,
  },
  currentBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 4,
  },
  currentBadgeText: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: '700',
  },
  eventCardHeader: {
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
  expandArrow: {
    fontSize: 10,
    color: '#94A3B8',
    marginLeft: 8,
  },
  eventExpanded: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  eventDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  eventDescBox: {
    marginBottom: 12,
  },
  eventDescText: {
    fontSize: 13,
    color: '#1E293B',
    lineHeight: 20,
    marginTop: 4,
  },

  // Task card styles
  taskCard: {
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  taskCardExpanded: {
    borderColor: '#3B82F6',
    borderWidth: 1.5,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  taskHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  taskName: { fontSize: 14, fontWeight: '600', color: '#1E293B', flex: 1 },
  taskDetail: { fontSize: 12, color: '#64748B' },
  taskExpanded: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  detailRow: {
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 13,
    color: '#1E293B',
  },
  reasoningBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
  },
  reasoningLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B82F6',
    marginBottom: 4,
  },
  reasoningText: {
    fontSize: 13,
    color: '#1E40AF',
    lineHeight: 20,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  detailItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    minWidth: '45%',
    flex: 1,
  },
  taskActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  deleteButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
  },
  editButton: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  scheduleButton: {
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  scheduleButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
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
