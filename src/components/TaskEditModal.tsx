// Shared task edit modal used on Dashboard and Proposal screens
// Includes web-native datetime picker for deadline input
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { Task, Priority, PreferredTime } from '../types';

interface Props {
  task: Task;
  onSave: (task: Task) => void;
  onCancel: () => void;
}

const webDateInputStyle: any = {
  backgroundColor: '#F8FAFC',
  border: '1px solid #E2E8F0',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 15,
  color: '#1E293B',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

// Format a deadline string to datetime-local format (YYYY-MM-DDThh:mm)
function toDatetimeLocal(deadline: string | null): string {
  if (!deadline) return '';
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Format to date-only (YYYY-MM-DD) for the date input
function toDateOnly(deadline: string | null): string {
  if (!deadline) return '';
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function TaskEditModal({ task, onSave, onCancel }: Props) {
  const [name, setName] = useState(task.name);
  const [duration, setDuration] = useState(String(task.duration_minutes));
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [deadlineDate, setDeadlineDate] = useState(() => toDateOnly(task.deadline));
  const [deadlineTime, setDeadlineTime] = useState(() => {
    if (!task.deadline) return '23:59';
    const d = new Date(task.deadline);
    if (isNaN(d.getTime())) return '23:59';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
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
    let parsedDeadline: string | null = null;

    if (deadlineDate.trim()) {
      // Combine date + time
      const timeStr = deadlineTime.trim() || '23:59';
      const combined = `${deadlineDate.trim()}T${timeStr}:00`;
      const d = new Date(combined);
      if (!isNaN(d.getTime())) {
        parsedDeadline = d.toISOString();
      } else {
        parsedDeadline = task.deadline; // fallback to original
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
    <Modal visible={true} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>タスクを編集</Text>

            {/* Name */}
            <Text style={styles.label}>タスク名</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
            />

            {/* Duration */}
            <Text style={styles.label}>所要時間（分）</Text>
            <TextInput
              style={styles.input}
              value={duration}
              onChangeText={setDuration}
              keyboardType="number-pad"
            />

            {/* Priority */}
            <Text style={styles.label}>優先度</Text>
            <View style={styles.chipRow}>
              {priorities.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.chip, priority === p && styles.chipActive]}
                  onPress={() => setPriority(p)}
                >
                  <Text style={[styles.chipText, priority === p && styles.chipTextActive]}>
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Deadline - date + time */}
            <Text style={styles.label}>締切日</Text>
            {Platform.OS === 'web' ? (
              React.createElement('input', {
                type: 'date',
                value: deadlineDate,
                onChange: (e: any) => setDeadlineDate(e.target.value),
                style: webDateInputStyle,
              })
            ) : (
              <TextInput
                style={styles.input}
                value={deadlineDate}
                onChangeText={setDeadlineDate}
                placeholder="例: 2026-02-15（空欄で締切なし）"
                placeholderTextColor="#94A3B8"
              />
            )}

            <Text style={styles.label}>締切時刻</Text>
            {Platform.OS === 'web' ? (
              React.createElement('input', {
                type: 'time',
                value: deadlineTime,
                onChange: (e: any) => setDeadlineTime(e.target.value),
                style: webDateInputStyle,
              })
            ) : (
              <TextInput
                style={styles.input}
                value={deadlineTime}
                onChangeText={setDeadlineTime}
                placeholder="例: 17:00（空欄で23:59）"
                placeholderTextColor="#94A3B8"
              />
            )}

            {Platform.OS === 'web' && deadlineDate && (
              <TouchableOpacity onPress={() => { setDeadlineDate(''); setDeadlineTime('23:59'); }}>
                <Text style={styles.clearDeadline}>締切をクリア</Text>
              </TouchableOpacity>
            )}

            {/* Preferred time */}
            <Text style={styles.label}>希望時間帯</Text>
            <View style={styles.chipRow}>
              {timeSlots.map((slot) => (
                <TouchableOpacity
                  key={slot.label}
                  style={[styles.chip, preferredTime === slot.value && styles.chipActive]}
                  onPress={() => setPreferredTime(slot.value)}
                >
                  <Text style={[styles.chipText, preferredTime === slot.value && styles.chipTextActive]}>
                    {slot.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Buttons */}
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
                <Text style={styles.cancelButtonText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>保存</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  clearDeadline: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
