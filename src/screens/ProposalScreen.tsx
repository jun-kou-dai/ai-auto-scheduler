// Screen 4: Proposal - show proposed events, allow time editing, approve
// All tasks are always placed. Users can change time for any event.
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { getBusySlots, calculateFreeSlots, createEventsFromProposal, CalendarApiError } from '../services/calendar';
import { generateProposal } from '../services/scheduler';
import { Task, Proposal, ProposalEvent, Screen } from '../types';
import { TaskEditModal } from '../components/TaskEditModal';

interface Props {
  onNavigate: (screen: Screen) => void;
  tasks: Task[];
  onTasksUpdated: (tasks: Task[]) => void;
}

type ProposalState = 'loading' | 'ready' | 'approving' | 'done' | 'error';

// Helper to format ISO datetime to datetime-local input value
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ProposalScreen({ onNavigate, tasks, onTasksUpdated }: Props) {
  const { accessToken, logout } = useAuth();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [state, setState] = useState<ProposalState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState(0);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  // Track which event is having its time edited
  const [editingTimeTaskId, setEditingTimeTaskId] = useState<string | null>(null);
  const [editingTimeValue, setEditingTimeValue] = useState('');

  // Store free slots for re-proposal after edit
  const freeSlotsRef = useRef<any[]>([]);

  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    generateScheduleProposal();
  }, [accessToken]);

  const generateScheduleProposal = async () => {
    if (!accessToken) {
      setError('ログインが必要です');
      setState('error');
      return;
    }

    setState('loading');
    setError(null);

    try {
      // Get busy slots for 7 days
      const busySlots = await getBusySlots(accessToken, 7);
      // Calculate free slots (6:00-23:00)
      const freeSlots = calculateFreeSlots(busySlots, 7);
      freeSlotsRef.current = freeSlots;
      // Generate proposal - all tasks will be placed
      const unassignedTasks = tasks.filter((t) => t.status === 'unassigned');
      const prop = generateProposal(unassignedTasks, freeSlots);
      setProposal(prop);
      setState('ready');
    } catch (err) {
      if (err instanceof CalendarApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  };

  // Re-propose using cached free slots (no extra API call)
  const rePropose = useCallback((updatedTasks: Task[]) => {
    const unassignedTasks = updatedTasks.filter((t) => t.status === 'unassigned');
    const prop = generateProposal(unassignedTasks, freeSlotsRef.current);
    setProposal(prop);
  }, []);

  const handleSaveEdit = (updated: Task) => {
    const newTasks = tasks.map((t) => (t.id === updated.id ? updated : t));
    onTasksUpdated(newTasks);
    setEditingTask(null);
    setExpandedTaskId(null);
    rePropose(newTasks);
  };

  // Handle manual time change for an event
  const handleTimeChange = (taskId: string, newStartISO: string) => {
    if (!proposal) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const newStart = new Date(newStartISO);
    if (isNaN(newStart.getTime())) return;

    const newEnd = new Date(newStart.getTime() + task.duration_minutes * 60000);

    const updatedEvents = proposal.events.map((evt) => {
      if (evt.taskId === taskId) {
        return {
          ...evt,
          start: newStart.toISOString(),
          end: newEnd.toISOString(),
          warning: evt.warning ? undefined : undefined, // Clear old warning
        };
      }
      return evt;
    });

    setProposal({ ...proposal, events: updatedEvents });
    setEditingTimeTaskId(null);
    setEditingTimeValue('');
  };

  const handleApprove = async () => {
    if (!accessToken || !proposal) return;

    setState('approving');
    setError(null);

    try {
      const eventsToCreate = proposal.events.map((e) => ({
        title: e.title,
        start: e.start,
        end: e.end,
      }));

      await createEventsFromProposal(accessToken, eventsToCreate);
      setCreatedCount(eventsToCreate.length);

      // Update task statuses
      const scheduledIds = new Set(proposal.events.map((e) => e.taskId));
      const updatedTasks = tasks.map((t) =>
        scheduledIds.has(t.id) ? { ...t, status: 'scheduled' as const } : t
      );
      onTasksUpdated(updatedTasks);

      setState('done');
    } catch (err) {
      if (err instanceof CalendarApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  };

  const getTaskById = (id: string) => tasks.find((t) => t.id === id);

  const toggleExpand = (taskId: string) => {
    setExpandedTaskId((prev) => (prev === taskId ? null : taskId));
    // Close time editor when toggling
    if (editingTimeTaskId === taskId) {
      setEditingTimeTaskId(null);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => onNavigate('dashboard')}>
          <Text style={styles.backButton}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>提案</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {state === 'loading' && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>
              スケジュールを生成中...{'\n'}空き時間を分析しています
            </Text>
          </View>
        )}

        {state === 'error' && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>エラーが発生しました</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={generateScheduleProposal}>
              <Text style={styles.retryButtonText}>再試行</Text>
            </TouchableOpacity>
          </View>
        )}

        {state === 'done' && (
          <View style={styles.successBox}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>
              {createdCount}件のイベントを作成しました
            </Text>
            <Text style={styles.successText}>
              Google カレンダーに反映されました
            </Text>
            <TouchableOpacity
              style={styles.backToDashButton}
              onPress={() => onNavigate('dashboard')}
            >
              <Text style={styles.backToDashText}>ダッシュボードへ戻る</Text>
            </TouchableOpacity>
          </View>
        )}

        {(state === 'ready' || state === 'approving') && proposal && (
          <>
            <Text style={styles.hintText}>カードをタップで詳細・時刻変更</Text>

            {/* Scheduled events */}
            {proposal.events.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  配置するイベント ({proposal.events.length}件)
                </Text>
                {proposal.events.map((evt, i) => {
                  const task = getTaskById(evt.taskId);
                  const isExpanded = expandedTaskId === evt.taskId;
                  const isEditingTime = editingTimeTaskId === evt.taskId;
                  const startDate = new Date(evt.start);
                  const endDate = new Date(evt.end);
                  const dayLabel = startDate.toLocaleDateString('ja-JP', {
                    month: 'short',
                    day: 'numeric',
                    weekday: 'short',
                  });
                  const timeLabel = `${startDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;

                  return (
                    <View key={i} style={[styles.proposalCard, isExpanded && styles.proposalCardExpanded, evt.warning ? styles.proposalCardWarning : null]}>
                      {/* Header: tap to expand/collapse */}
                      <TouchableOpacity
                        onPress={() => toggleExpand(evt.taskId)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.proposalCardHeader}>
                          <Text style={styles.proposalTitle}>{evt.title}</Text>
                          <View style={styles.cardHeaderRight}>
                            {task && <PriorityBadge priority={task.priority} />}
                            <Text style={styles.expandArrow}>{isExpanded ? '▲' : '▼'}</Text>
                          </View>
                        </View>
                        <Text style={styles.proposalTime}>
                          {dayLabel}  {timeLabel}
                        </Text>
                        <Text style={styles.proposalDuration}>
                          {task ? `${task.duration_minutes}分` : ''}
                          {task?.preferred_time ? ` | ${task.preferred_time}希望` : ''}
                          {task?.deadline ? ` | 締切: ${new Date(task.deadline).toLocaleDateString('ja-JP')}` : ''}
                        </Text>
                        {evt.warning && (
                          <View style={styles.warningBanner}>
                            <Text style={styles.warningText}>⚠ {evt.warning}</Text>
                          </View>
                        )}
                      </TouchableOpacity>

                      {/* Expanded body */}
                      {isExpanded && (
                        <View style={styles.expandedSection}>
                          {task && (
                            <>
                              <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>元の入力:</Text>
                                <Text style={styles.detailValue}>「{task.raw}」</Text>
                              </View>

                              {task.reasoning ? (
                                <View style={styles.reasoningBox}>
                                  <Text style={styles.reasoningLabel}>AI推定の根拠:</Text>
                                  <Text style={styles.reasoningText}>{task.reasoning}</Text>
                                </View>
                              ) : null}

                              <View style={styles.detailGrid}>
                                <View style={styles.detailItem}>
                                  <Text style={styles.detailLabel}>所要時間</Text>
                                  <Text style={styles.detailValue}>{task.duration_minutes}分</Text>
                                </View>
                                <View style={styles.detailItem}>
                                  <Text style={styles.detailLabel}>優先度</Text>
                                  <Text style={styles.detailValue}>{task.priority}</Text>
                                </View>
                                <View style={styles.detailItem}>
                                  <Text style={styles.detailLabel}>締切</Text>
                                  <Text style={styles.detailValue}>
                                    {task.deadline ? new Date(task.deadline).toLocaleDateString('ja-JP') : 'なし'}
                                  </Text>
                                </View>
                                <View style={styles.detailItem}>
                                  <Text style={styles.detailLabel}>希望時間帯</Text>
                                  <Text style={styles.detailValue}>{task.preferred_time || 'なし'}</Text>
                                </View>
                              </View>
                            </>
                          )}

                          {/* Time change UI */}
                          {isEditingTime && Platform.OS === 'web' ? (
                            <View style={styles.timeEditBox}>
                              <Text style={styles.timeEditLabel}>開始日時を変更:</Text>
                              {React.createElement('input', {
                                type: 'datetime-local',
                                value: editingTimeValue,
                                onChange: (e: any) => setEditingTimeValue(e.target.value),
                                style: {
                                  backgroundColor: '#F8FAFC',
                                  border: '1px solid #3B82F6',
                                  borderRadius: 8,
                                  padding: '10px 12px',
                                  fontSize: 15,
                                  color: '#1E293B',
                                  width: '100%',
                                  boxSizing: 'border-box',
                                  fontFamily: 'inherit',
                                },
                              })}
                              <View style={styles.timeEditButtons}>
                                <TouchableOpacity
                                  style={styles.timeEditCancel}
                                  onPress={() => { setEditingTimeTaskId(null); setEditingTimeValue(''); }}
                                >
                                  <Text style={styles.timeEditCancelText}>キャンセル</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={styles.timeEditConfirm}
                                  onPress={() => handleTimeChange(evt.taskId, editingTimeValue)}
                                >
                                  <Text style={styles.timeEditConfirmText}>変更</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          ) : (
                            <View style={styles.actionRow}>
                              <TouchableOpacity
                                style={styles.timeChangeButton}
                                onPress={() => {
                                  setEditingTimeTaskId(evt.taskId);
                                  setEditingTimeValue(toDatetimeLocal(evt.start));
                                }}
                              >
                                <Text style={styles.timeChangeButtonText}>時刻を変更</Text>
                              </TouchableOpacity>
                              {task && (
                                <TouchableOpacity
                                  style={styles.editButton}
                                  onPress={() => setEditingTask({ ...task })}
                                >
                                  <Text style={styles.editButtonText}>タスクを編集</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {proposal.events.length === 0 && (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>提案するイベントがありません</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Approve button */}
      {(state === 'ready' || state === 'approving') && proposal && proposal.events.length > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.approveButton, state === 'approving' && styles.approveButtonDisabled]}
            onPress={handleApprove}
            disabled={state === 'approving'}
          >
            {state === 'approving' ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#FFF" size="small" />
                <Text style={styles.approveButtonText}>  カレンダーに作成中...</Text>
              </View>
            ) : (
              <Text style={styles.approveButtonText}>
                {proposal.events.length}件をカレンダーに作成
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Edit Modal */}
      {editingTask && (
        <TaskEditModal
          key={editingTask.id}
          task={editingTask}
          onSave={handleSaveEdit}
          onCancel={() => setEditingTask(null)}
        />
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
  backButton: { fontSize: 15, color: '#3B82F6', fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1E293B' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  hintText: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 12,
    textAlign: 'center',
  },
  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  loadingText: { marginTop: 16, color: '#64748B', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  errorTitle: { fontSize: 16, fontWeight: '700', color: '#DC2626', marginBottom: 8 },
  errorText: { color: '#7F1D1D', fontSize: 13, textAlign: 'center', marginBottom: 16 },
  retryButton: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
  successBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  successIcon: { fontSize: 48, color: '#16A34A', marginBottom: 12 },
  successTitle: { fontSize: 18, fontWeight: '700', color: '#166534', marginBottom: 8 },
  successText: { color: '#15803D', fontSize: 14, marginBottom: 20 },
  backToDashButton: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backToDashText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 12 },
  proposalCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 8,
  },
  proposalCardExpanded: {
    borderColor: '#3B82F6',
    borderWidth: 1.5,
  },
  proposalCardWarning: {
    borderColor: '#F59E0B',
  },
  proposalCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  expandArrow: {
    fontSize: 10,
    color: '#94A3B8',
  },
  proposalTitle: { fontSize: 15, fontWeight: '600', color: '#1E293B', flex: 1 },
  proposalTime: { fontSize: 13, color: '#3B82F6', fontWeight: '600', marginBottom: 2 },
  proposalDuration: { fontSize: 12, color: '#64748B' },
  warningBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
  },
  warningText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
  },
  expandedSection: {
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
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  timeChangeButton: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  timeChangeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  editButton: {
    flex: 1,
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
    color: '#64748B',
  },
  // Time edit inline
  timeEditBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  timeEditLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 8,
  },
  timeEditButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  timeEditCancel: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  timeEditCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  timeEditConfirm: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: '#3B82F6',
  },
  timeEditConfirmText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  emptyBox: {
    backgroundColor: '#FFF',
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  emptyText: { color: '#94A3B8', fontSize: 14 },
  footer: {
    padding: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  approveButton: {
    backgroundColor: '#16A34A',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  approveButtonDisabled: { opacity: 0.7 },
  approveButtonText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  loadingRow: { flexDirection: 'row', alignItems: 'center' },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
});
