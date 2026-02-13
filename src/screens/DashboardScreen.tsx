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
  TextInput,
  Modal,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { getUpcomingEvents } from '../services/calendar';
import { CalendarEvent, Screen, Task, Priority, PreferredTime } from '../types';

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
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const toggleExpand = (taskId: string) => {
    setExpandedTaskId((prev) => (prev === taskId ? null : taskId));
  };

  const handleSaveEdit = (updated: Task) => {
    const newTasks = tasks.map((t) => (t.id === updated.id ? updated : t));
    onTasksUpdated(newTasks);
    setEditingTask(null);
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
                <Text style={styles.sectionHint}>タップして詳細を表示</Text>
                {unassignedTasks.map((t) => {
                  const isExpanded = expandedTaskId === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.taskCard, isExpanded && styles.taskCardExpanded]}
                      onPress={() => toggleExpand(t.id)}
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
                        {t.deadline ? ` | 締切: ${new Date(t.deadline).toLocaleDateString('ja-JP')}` : ''}
                        {t.preferred_time ? ` | ${t.preferred_time}希望` : ''}
                      </Text>

                      {isExpanded && (
                        <View style={styles.taskExpanded}>
                          {/* Original input */}
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>元の入力:</Text>
                            <Text style={styles.detailValue}>「{t.raw}」</Text>
                          </View>

                          {/* AI reasoning */}
                          {t.reasoning ? (
                            <View style={styles.reasoningBox}>
                              <Text style={styles.reasoningLabel}>AI推定の根拠:</Text>
                              <Text style={styles.reasoningText}>{t.reasoning}</Text>
                            </View>
                          ) : null}

                          {/* All details */}
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
                                {t.deadline ? new Date(t.deadline).toLocaleDateString('ja-JP') : 'なし'}
                              </Text>
                            </View>
                            <View style={styles.detailItem}>
                              <Text style={styles.detailLabel}>希望時間帯</Text>
                              <Text style={styles.detailValue}>{t.preferred_time || 'なし'}</Text>
                            </View>
                          </View>

                          {/* Edit button */}
                          <TouchableOpacity
                            style={styles.editButton}
                            onPress={() => setEditingTask({ ...t })}
                          >
                            <Text style={styles.editButtonText}>編集する</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Edit Modal */}
            {editingTask && (
              <TaskEditModal
                task={editingTask}
                onSave={handleSaveEdit}
                onCancel={() => setEditingTask(null)}
              />
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

function TaskEditModal({
  task,
  onSave,
  onCancel,
}: {
  task: Task;
  onSave: (t: Task) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(task.name);
  const [duration, setDuration] = useState(String(task.duration_minutes));
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [deadline, setDeadline] = useState(
    task.deadline ? new Date(task.deadline).toLocaleDateString('ja-JP') : ''
  );
  const [preferredTime, setPreferredTime] = useState<PreferredTime>(task.preferred_time);

  const priorities: Priority[] = ['高', '中', '低'];
  const timeSlots: { label: string; value: PreferredTime }[] = [
    { label: '指定なし', value: null },
    { label: '午前', value: '午前' },
    { label: '午後', value: '午後' },
    { label: '夜', value: '夜' },
  ];

  const handleSave = () => {
    const durationNum = parseInt(duration, 10);
    // Parse deadline: support YYYY/MM/DD, YYYY-MM-DD, or Japanese format
    let parsedDeadline: string | null = null;
    if (deadline.trim()) {
      const d = new Date(deadline.replace(/\//g, '-').replace(/年|月/g, '-').replace(/日/g, ''));
      if (!isNaN(d.getTime())) {
        parsedDeadline = d.toISOString();
      } else {
        parsedDeadline = task.deadline; // keep original if parse fails
      }
    }
    onSave({
      ...task,
      name,
      duration_minutes: isNaN(durationNum) || durationNum <= 0 ? task.duration_minutes : durationNum,
      priority,
      deadline: parsedDeadline,
      preferred_time: preferredTime,
    });
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onCancel}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.container}>
          <Text style={modalStyles.title}>タスクを編集</Text>

          {/* Name */}
          <Text style={modalStyles.label}>タスク名</Text>
          <TextInput
            style={modalStyles.input}
            value={name}
            onChangeText={setName}
          />

          {/* Duration */}
          <Text style={modalStyles.label}>所要時間（分）</Text>
          <TextInput
            style={modalStyles.input}
            value={duration}
            onChangeText={setDuration}
            keyboardType="number-pad"
          />

          {/* Priority */}
          <Text style={modalStyles.label}>優先度</Text>
          <View style={modalStyles.chipRow}>
            {priorities.map((p) => (
              <TouchableOpacity
                key={p}
                style={[
                  modalStyles.chip,
                  priority === p && modalStyles.chipActive,
                ]}
                onPress={() => setPriority(p)}
              >
                <Text
                  style={[
                    modalStyles.chipText,
                    priority === p && modalStyles.chipTextActive,
                  ]}
                >
                  {p}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Deadline */}
          <Text style={modalStyles.label}>締切（YYYY/MM/DD）</Text>
          <TextInput
            style={modalStyles.input}
            value={deadline}
            onChangeText={setDeadline}
            placeholder="例: 2026/02/15（空欄で締切なし）"
            placeholderTextColor="#94A3B8"
          />

          {/* Preferred time */}
          <Text style={modalStyles.label}>希望時間帯</Text>
          <View style={modalStyles.chipRow}>
            {timeSlots.map((slot) => (
              <TouchableOpacity
                key={slot.label}
                style={[
                  modalStyles.chip,
                  preferredTime === slot.value && modalStyles.chipActive,
                ]}
                onPress={() => setPreferredTime(slot.value)}
              >
                <Text
                  style={[
                    modalStyles.chipText,
                    preferredTime === slot.value && modalStyles.chipTextActive,
                  ]}
                >
                  {slot.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Buttons */}
          <View style={modalStyles.buttonRow}>
            <TouchableOpacity style={modalStyles.cancelButton} onPress={onCancel}>
              <Text style={modalStyles.cancelButtonText}>キャンセル</Text>
            </TouchableOpacity>
            <TouchableOpacity style={modalStyles.saveButton} onPress={handleSave}>
              <Text style={modalStyles.saveButtonText}>保存</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 20,
    textAlign: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1E293B',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  chipText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFF',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
});

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
  sectionHint: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 8,
    marginTop: -8,
  },
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
  expandArrow: {
    fontSize: 10,
    color: '#94A3B8',
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
