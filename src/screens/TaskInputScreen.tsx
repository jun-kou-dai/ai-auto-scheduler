// Screen 3: Task input - multi-line input + "analyze and propose"
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { analyzeTasks } from '../services/ai';
import { Task, Screen } from '../types';

interface Props {
  onNavigate: (screen: Screen) => void;
  onTasksAnalyzed: (tasks: Task[]) => void;
}

export function TaskInputScreen({ onNavigate, onTasksAnalyzed }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exampleTasks = `レポートの下書きを作る（2時間、金曜まで）
チームMTGの資料準備
メール返信（30分くらい）
来週のプレゼン準備（急ぎ）
経費精算`;

  const handleAnalyze = async () => {
    if (!input.trim()) {
      setError('タスクを入力してください');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const tasks = await analyzeTasks(input);
      onTasksAnalyzed(tasks);
      onNavigate('proposal');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const lineCount = input.split('\n').filter((l) => l.trim()).length;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => onNavigate('dashboard')}>
          <Text style={styles.backButton}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>タスク入力</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.instruction}>
          やりたいことを1行ずつ入力してください。{'\n'}
          所要時間・締切・優先度はAIが推定します。
        </Text>

        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.textInput}
            multiline
            numberOfLines={8}
            placeholder={exampleTasks}
            placeholderTextColor="#94A3B8"
            value={input}
            onChangeText={setInput}
            textAlignVertical="top"
          />
          {lineCount > 0 && (
            <Text style={styles.lineCount}>{lineCount} タスク</Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.exampleButton}
          onPress={() => setInput(exampleTasks)}
        >
          <Text style={styles.exampleButtonText}>例文を使う</Text>
        </TouchableOpacity>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>AIが推定するもの：</Text>
          <Text style={styles.infoText}>
            ・タスク名（簡潔に整理）{'\n'}
            ・所要時間（分）{'\n'}
            ・締切（あれば）{'\n'}
            ・優先度（高/中/低）{'\n'}
            ・希望時間帯（午前/午後/夜）
          </Text>
        </View>
      </ScrollView>

      {/* Bottom action */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.analyzeButton, loading && styles.analyzeButtonDisabled]}
          onPress={handleAnalyze}
          disabled={loading}
        >
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#FFF" size="small" />
              <Text style={styles.analyzeButtonText}>  AI解析中...</Text>
            </View>
          ) : (
            <Text style={styles.analyzeButtonText}>解析して提案を作成</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
  instruction: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 22,
    marginBottom: 16,
  },
  inputWrapper: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 4,
    marginBottom: 12,
  },
  textInput: {
    minHeight: 180,
    padding: 12,
    fontSize: 15,
    color: '#1E293B',
    lineHeight: 24,
  },
  lineCount: {
    textAlign: 'right',
    padding: 8,
    fontSize: 12,
    color: '#94A3B8',
  },
  exampleButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    marginBottom: 16,
  },
  exampleButtonText: { color: '#3B82F6', fontSize: 13, fontWeight: '600' },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorText: { color: '#DC2626', fontSize: 13 },
  infoBox: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
  },
  infoTitle: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  infoText: { fontSize: 13, color: '#6B7280', lineHeight: 22 },
  footer: {
    padding: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  analyzeButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  analyzeButtonDisabled: { opacity: 0.7 },
  analyzeButtonText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  loadingRow: { flexDirection: 'row', alignItems: 'center' },
});
