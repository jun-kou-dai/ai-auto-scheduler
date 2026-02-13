// Screen 4: Proposal - show proposed events, unassigned reasons, approve
// Tasks are expandable and editable; editing triggers re-proposal
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { getBusySlots, calculateFreeSlots, createEventsFromProposal, CalendarApiError } from '../services/calendar';
import { generateProposal } from '../services/scheduler';
import { Task, Proposal, Screen } from '../types';
import { TaskEditModal } from '../components/TaskEditModal';

interface Props {
  onNavigate: (screen: Screen) => void;
  tasks: Task[];
  onTasksUpdated: (tasks: Task[]) => void;
}

type ProposalState = 'loading' | 'ready' | 'approving' | 'done' | 'error';

export function ProposalScreen({ onNavigate, tasks, onTasksUpdated }: Props) {
  const { accessToken, logout } = useAuth();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [state, setState] = useState<ProposalState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState(0);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

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
      // Calculate free slots
      const freeSlots = calculateFreeSlots(busySlots, 7);
      freeSlotsRef.current = freeSlots;
      // Generate proposal
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
    // Re-generate proposal with updated task
    rePropose(newTasks);
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
            <Text style={styles.hintText}>カードをタップで詳細表示・編集</Text>

            {/* Scheduled events */}
            {proposal.events.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  配置するイベント ({proposal.events.length}件)
                </Text>
                {proposal.events.map((evt, i) => {
                  const task = getTaskById(evt.taskId);
                  const isExpanded = expandedTaskId === evt.taskId;
                  const startDate = new Date(evt.start);
                  const endDate = new Date(evt.end);
                  const dayLabel = startDate.toLocaleDateString('ja-JP', {
                    month: 'short',
                    day: 'numeric',
                    weekday: 'short',
                  });
                  const timeLabel = `${startDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;

                  return (
                    <View key={i} style={[styles.proposalCard, isExpanded && styles.proposalCardExpanded]}>
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

                      {/* Expanded body: separate from header touchable */}
                      {isExpanded && task && (
                        <View style={styles.expandedSection}>
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

                          <TouchableOpacity
                            style={styles.editButton}
                            onPress={() => setEditingTask({ ...task })}
                          >
                            <Text style={styles.editButtonText}>編集して再提案</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Unassigned tasks */}
            {proposal.unassigned.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitleWarn}>
                  未割当タスク ({proposal.unassigned.length}件)
                </Text>
                {proposal.unassigned.map((item, i) => {
                  const task = getTaskById(item.taskId);
                  const isExpanded = expandedTaskId === item.taskId;
                  return (
                    <View key={i} style={[styles.unassignedCard, isExpanded && styles.unassignedCardExpanded]}>
                      <TouchableOpacity
                        onPress={() => toggleExpand(item.taskId)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.proposalCardHeader}>
                          <Text style={styles.unassignedName}>
                            {task?.name || '不明なタスク'}
                          </Text>
                          <Text style={styles.expandArrow}>{isExpanded ? '▲' : '▼'}</Text>
                        </View>
                        <Text style={styles.unassignedReason}>{item.reason}</Text>
                      </TouchableOpacity>

                      {isExpanded && task && (
                        <View style={styles.expandedSection}>
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

                          <TouchableOpacity
                            style={styles.editButton}
                            onPress={() => setEditingTask({ ...task })}
                          >
                            <Text style={styles.editButtonText}>編集して再提案</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {proposal.events.length === 0 && proposal.unassigned.length === 0 && (
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
  sectionTitleWarn: { fontSize: 16, fontWeight: '700', color: '#92400E', marginBottom: 12 },
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
  editButton: {
    backgroundColor: '#EFF6FF',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  unassignedCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 14,
    marginBottom: 8,
  },
  unassignedCardExpanded: {
    borderColor: '#F59E0B',
    borderWidth: 1.5,
  },
  unassignedName: { fontSize: 14, fontWeight: '600', color: '#92400E', marginBottom: 4 },
  unassignedReason: { fontSize: 13, color: '#78350F', lineHeight: 20 },
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
