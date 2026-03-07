// Screen 3.5: Confirm - show AI understanding for user review before scheduling
// Flow: TaskInput → AI analysis → ConfirmScreen → ProposalScreen
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Task, Screen, ConfidenceLevel } from '../types';
import { TaskEditModal } from '../components/TaskEditModal';
import { analyzeTasks } from '../services/ai';

interface Props {
  onNavigate: (screen: Screen) => void;
  tasks: Task[];
  onTasksUpdated: (tasks: Task[]) => void;
}

function confidenceLabel(level: ConfidenceLevel | undefined): string {
  if (!level || level === 'high') return '';
  return level === 'medium' ? 'AI推定' : 'デフォルト';
}

function confidenceColor(level: ConfidenceLevel | undefined): string {
  if (!level || level === 'high') return 'transparent';
  return level === 'medium' ? '#F59E0B' : '#EF4444';
}

function formatDuration(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}時間${m}分` : `${h}時間`;
  }
  return `${minutes}分`;
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  });
}

export function ConfirmScreen({ onNavigate, tasks, onTasksUpdated }: Props) {
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [addingTask, setAddingTask] = useState(false);
  const [addInput, setAddInput] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Only show unassigned tasks (newly analyzed ones)
  const unassignedTasks = tasks.filter((t) => t.status === 'unassigned');

  const handleSaveEdit = (updated: Task) => {
    // When user edits, set confidence to high for edited fields
    const newTasks = tasks.map((t) => (t.id === updated.id ? updated : t));
    onTasksUpdated(newTasks);
    setEditingTask(null);
  };

  const handleDeleteTask = (taskId: string) => {
    const newTasks = tasks.filter((t) => t.id !== taskId);
    onTasksUpdated(newTasks);
  };

  const handleAddTask = async () => {
    if (!addInput.trim()) return;

    setAddLoading(true);
    setAddError(null);

    try {
      const newTasks = await analyzeTasks(addInput);
      onTasksUpdated([...tasks, ...newTasks]);
      setAddInput('');
      setAddingTask(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err));
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => onNavigate('taskInput')}>
          <Text style={styles.backButton}>← 入力に戻る</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AIの理解を確認</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.instruction}>
          AIがあなたの入力を解析しました。{'\n'}
          内容を確認して、必要なら修正してください。
        </Text>

        {unassignedTasks.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>タスクがありません</Text>
            <TouchableOpacity
              style={styles.backToInputButton}
              onPress={() => onNavigate('taskInput')}
            >
              <Text style={styles.backToInputButtonText}>タスクを入力する</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {unassignedTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onEdit={() => setEditingTask({ ...task })}
                onDelete={() => handleDeleteTask(task.id)}
              />
            ))}
          </>
        )}

        {/* Add task section */}
        {addingTask ? (
          <View style={styles.addTaskBox}>
            <Text style={styles.addTaskLabel}>追加タスクを入力</Text>
            <TextInput
              style={styles.addTaskInput}
              value={addInput}
              onChangeText={setAddInput}
              placeholder="例: 明日の午後にプレゼン準備"
              placeholderTextColor="#94A3B8"
              multiline
            />
            {addError && (
              <Text style={styles.addError}>{addError}</Text>
            )}
            <View style={styles.addTaskButtons}>
              <TouchableOpacity
                style={styles.addCancelButton}
                onPress={() => { setAddingTask(false); setAddInput(''); setAddError(null); }}
              >
                <Text style={styles.addCancelText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.addConfirmButton, addLoading && styles.buttonDisabled]}
                onPress={handleAddTask}
                disabled={addLoading}
              >
                {addLoading ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.addConfirmText}>AI解析して追加</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setAddingTask(true)}
          >
            <Text style={styles.addButtonText}>+ タスクを追加</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Footer */}
      {unassignedTasks.length > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.proceedButton}
            onPress={() => onNavigate('proposal')}
          >
            <Text style={styles.proceedButtonText}>
              これでスケジュール作成 →
            </Text>
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

// Individual task card component
function TaskCard({
  task,
  onEdit,
  onDelete,
}: {
  task: Task;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const conf = task.confidence;

  const durationConf = conf?.duration;
  const startConf = conf?.preferred_start;
  const priorityConf = conf?.priority;

  const hasLowConfidence = durationConf === 'low' || startConf === 'low' || priorityConf === 'low';
  const hasMediumConfidence = durationConf === 'medium' || startConf === 'medium' || priorityConf === 'medium';
  const needsAttention = hasLowConfidence || hasMediumConfidence;

  return (
    <View style={[styles.card, needsAttention && styles.cardAttention]}>
      <TouchableOpacity
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        {/* Task name and category */}
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{task.name}</Text>
            {needsAttention && (
              <View style={styles.attentionBadge}>
                <Text style={styles.attentionBadgeText}>要確認</Text>
              </View>
            )}
          </View>
          <Text style={styles.expandArrow}>{expanded ? '▲' : '▼'}</Text>
        </View>

        {/* Chips row */}
        <View style={styles.chipRow}>
          <ConfidenceChip
            label={formatDuration(task.duration_minutes)}
            confidence={durationConf}
            icon="⏱"
          />
          {task.preferred_start && (
            <ConfidenceChip
              label={`${formatDate(task.preferred_start)} ${formatTime(task.preferred_start)}`}
              confidence={startConf}
              icon="📅"
            />
          )}
          {!task.preferred_start && task.preferred_time && (
            <ConfidenceChip
              label={task.preferred_time}
              confidence={startConf}
              icon="🕐"
            />
          )}
          <ConfidenceChip
            label={`優先度: ${task.priority}`}
            confidence={priorityConf}
            icon=""
          />
          <View style={styles.categoryChip}>
            <Text style={styles.categoryChipText}>{task.category}</Text>
          </View>
        </View>

        {task.deadline && (
          <Text style={styles.deadlineText}>
            締切: {formatDate(task.deadline)} {formatTime(task.deadline)}
          </Text>
        )}
      </TouchableOpacity>

      {/* Expanded details */}
      {expanded && (
        <View style={styles.expandedSection}>
          {/* Original input */}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>元の入力</Text>
            <Text style={styles.detailValue}>「{task.raw}」</Text>
          </View>

          {/* AI reasoning */}
          {task.reasoning && (
            <View style={styles.reasoningBox}>
              <Text style={styles.reasoningLabel}>AIの推定根拠</Text>
              <Text style={styles.reasoningText}>{task.reasoning}</Text>
            </View>
          )}

          {/* Confidence details */}
          {needsAttention && (
            <View style={styles.confidenceBox}>
              <Text style={styles.confidenceTitle}>確信度の詳細</Text>
              <ConfidenceDetail label="所要時間" level={durationConf} value={formatDuration(task.duration_minutes)} />
              <ConfidenceDetail label="開始時刻" level={startConf} value={task.preferred_start ? formatTime(task.preferred_start) : '未指定'} />
              <ConfidenceDetail label="優先度" level={priorityConf} value={task.priority} />
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.editButton} onPress={onEdit}>
              <Text style={styles.editButtonText}>編集する</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteButton} onPress={onDelete}>
              <Text style={styles.deleteButtonText}>削除</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// Chip with confidence indicator
function ConfidenceChip({
  label,
  confidence,
  icon,
}: {
  label: string;
  confidence: ConfidenceLevel | undefined;
  icon: string;
}) {
  const isEstimated = confidence && confidence !== 'high';
  const bgColor = isEstimated
    ? confidence === 'low' ? '#FEF2F2' : '#FFFBEB'
    : '#F1F5F9';
  const borderColor = isEstimated
    ? confidence === 'low' ? '#FECACA' : '#FDE68A'
    : '#E2E8F0';
  const textColor = isEstimated
    ? confidence === 'low' ? '#DC2626' : '#D97706'
    : '#475569';

  return (
    <View style={[styles.confChip, { backgroundColor: bgColor, borderColor }]}>
      <Text style={[styles.confChipText, { color: textColor }]}>
        {icon ? `${icon} ` : ''}{label}
      </Text>
      {isEstimated && (
        <Text style={[styles.confBadge, { color: textColor }]}>
          {confidenceLabel(confidence)}
        </Text>
      )}
    </View>
  );
}

// Confidence detail row
function ConfidenceDetail({
  label,
  level,
  value,
}: {
  label: string;
  level: ConfidenceLevel | undefined;
  value: string;
}) {
  const color = confidenceColor(level);
  const levelText = !level || level === 'high' ? '明示' : level === 'medium' ? '推定' : 'デフォルト';
  const dotColor = !level || level === 'high' ? '#16A34A' : level === 'medium' ? '#F59E0B' : '#EF4444';

  return (
    <View style={styles.confDetailRow}>
      <View style={[styles.confDot, { backgroundColor: dotColor }]} />
      <Text style={styles.confDetailLabel}>{label}</Text>
      <Text style={styles.confDetailValue}>{value}</Text>
      <Text style={[styles.confDetailLevel, { color: dotColor }]}>{levelText}</Text>
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
  scrollContent: { padding: 16, paddingBottom: 32 },
  instruction: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 22,
    marginBottom: 16,
  },
  emptyBox: {
    backgroundColor: '#FFF',
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  emptyText: { color: '#94A3B8', fontSize: 14, marginBottom: 12 },
  backToInputButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backToInputButtonText: { color: '#FFF', fontWeight: '600', fontSize: 14 },

  // Task card
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 10,
  },
  cardAttention: {
    borderColor: '#FDE68A',
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  attentionBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  attentionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D97706',
  },
  expandArrow: {
    fontSize: 10,
    color: '#94A3B8',
    marginLeft: 8,
    marginTop: 4,
  },

  // Chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  confChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  confChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  confBadge: {
    fontSize: 9,
    fontWeight: '700',
  },
  categoryChip: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
  },
  deadlineText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
    marginTop: 4,
  },

  // Expanded section
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

  // Confidence detail
  confidenceBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  confidenceTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 8,
  },
  confDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  confDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  confDetailLabel: {
    fontSize: 12,
    color: '#64748B',
    width: 60,
  },
  confDetailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
  },
  confDetailLevel: {
    fontSize: 10,
    fontWeight: '700',
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    flex: 1,
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
  deleteButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
  },

  // Add task
  addButton: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  addTaskBox: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginTop: 4,
  },
  addTaskLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  addTaskInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1E293B',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  addError: {
    color: '#DC2626',
    fontSize: 12,
    marginTop: 6,
  },
  addTaskButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  addCancelButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  addCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  addConfirmButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#3B82F6',
  },
  addConfirmText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  buttonDisabled: { opacity: 0.7 },

  // Footer
  footer: {
    padding: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  proceedButton: {
    backgroundColor: '#16A34A',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  proceedButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 16,
  },
});
