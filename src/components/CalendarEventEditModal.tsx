// Modal for editing Google Calendar events (title, time, description, delete)
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
import { CalendarEvent } from '../types';

interface Props {
  event: CalendarEvent;
  onSave: (eventId: string, updates: { summary?: string; start?: string; end?: string; description?: string }) => void;
  onDelete: (eventId: string) => void;
  onCancel: () => void;
}

function formatDateTimeLocal(isoString?: string): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

const webInputStyle: any = {
  backgroundColor: '#F8FAFC',
  border: '1px solid #E2E8F0',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 15,
  color: '#1E293B',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  marginBottom: 4,
};

export function CalendarEventEditModal({ event, onSave, onDelete, onCancel }: Props) {
  const [title, setTitle] = useState(event.summary);
  const [description, setDescription] = useState(event.description || '');
  const [startTime, setStartTime] = useState(formatDateTimeLocal(event.start.dateTime));
  const [endTime, setEndTime] = useState(formatDateTimeLocal(event.end.dateTime));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isAllDay = !event.start.dateTime;

  const handleSave = () => {
    const updates: { summary?: string; start?: string; end?: string; description?: string } = {};
    if (title.trim() && title !== event.summary) updates.summary = title.trim();
    if (description !== (event.description || '')) updates.description = description;
    if (!isAllDay && startTime) {
      const d = new Date(startTime);
      if (!isNaN(d.getTime())) updates.start = d.toISOString();
    }
    if (!isAllDay && endTime) {
      const d = new Date(endTime);
      if (!isNaN(d.getTime())) updates.end = d.toISOString();
    }
    onSave(event.id, updates);
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete(event.id);
  };

  return (
    <Modal visible={true} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>予定を編集</Text>

            <Text style={styles.label}>タイトル</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
            />

            {!isAllDay && (
              <>
                <Text style={styles.label}>開始時刻</Text>
                {Platform.OS === 'web' ? (
                  React.createElement('input', {
                    type: 'datetime-local',
                    value: startTime,
                    onChange: (e: any) => setStartTime(e.target.value),
                    style: webInputStyle,
                  })
                ) : (
                  <TextInput
                    style={styles.input}
                    value={startTime}
                    onChangeText={setStartTime}
                    placeholder="YYYY-MM-DDTHH:MM"
                    placeholderTextColor="#94A3B8"
                  />
                )}

                <Text style={styles.label}>終了時刻</Text>
                {Platform.OS === 'web' ? (
                  React.createElement('input', {
                    type: 'datetime-local',
                    value: endTime,
                    onChange: (e: any) => setEndTime(e.target.value),
                    style: webInputStyle,
                  })
                ) : (
                  <TextInput
                    style={styles.input}
                    value={endTime}
                    onChangeText={setEndTime}
                    placeholder="YYYY-MM-DDTHH:MM"
                    placeholderTextColor="#94A3B8"
                  />
                )}
              </>
            )}

            <Text style={styles.label}>メモ</Text>
            <TextInput
              style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
              value={description}
              onChangeText={setDescription}
              multiline
              placeholder="メモを追加..."
              placeholderTextColor="#94A3B8"
            />

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
                <Text style={styles.cancelButtonText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>保存</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.deleteButton, confirmDelete && styles.deleteButtonConfirm]}
              onPress={handleDelete}
            >
              <Text style={[styles.deleteButtonText, confirmDelete && styles.deleteButtonTextConfirm]}>
                {confirmDelete ? '本当に削除しますか？タップで実行' : 'この予定を削除'}
              </Text>
            </TouchableOpacity>
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
  deleteButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FFF',
  },
  deleteButtonConfirm: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
  },
  deleteButtonTextConfirm: {
    color: '#FFF',
  },
});
