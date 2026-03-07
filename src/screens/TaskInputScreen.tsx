// Screen 3: Task input - multi-line input + voice input + "analyze and propose"
import React, { useState, useRef, useEffect } from 'react';
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
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const isListeningRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  // Recording timer
  useEffect(() => {
    if (isListening) {
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRecordingSeconds(0);
      setInterimText('');
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isListening]);

  // Cleanup voice recognition on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
        recognitionRef.current = null;
      }
    };
  }, []);

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
      onNavigate('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Web Speech API voice input
  const voiceSupported = Platform.OS === 'web' && typeof window !== 'undefined' &&
    (typeof (window as any).SpeechRecognition !== 'undefined' ||
     typeof (window as any).webkitSpeechRecognition !== 'undefined');

  const startVoiceInput = () => {
    if (Platform.OS !== 'web') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('お使いのブラウザは音声入力に対応していません。Chrome推奨です。');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const transcript = event.results[i][0].transcript.trim();
          if (transcript) {
            setInput((prev) => prev ? prev + '\n' + transcript : transcript);
          }
          setInterimText('');
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      if (interim) {
        setInterimText(interim);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        setError('マイクへのアクセスが許可されていません。ブラウザの設定を確認してください。');
        isListeningRef.current = false;
        setIsListening(false);
      } else if (event.error === 'no-speech') {
        // no-speech is normal during pauses, auto-restart handles it
      } else if (event.error !== 'aborted') {
        setError('音声認識エラー: ' + event.error);
        isListeningRef.current = false;
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      // Auto-restart with short delay to prevent browser throttling
      if (recognitionRef.current && isListeningRef.current) {
        setTimeout(() => {
          if (isListeningRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch {
              isListeningRef.current = false;
              setIsListening(false);
            }
          }
        }, 300);
      } else {
        isListeningRef.current = false;
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    isListeningRef.current = true;
    setIsListening(true);
    setError(null);
  };

  const stopVoiceInput = () => {
    isListeningRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
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
          <View style={styles.inputFooter}>
            {lineCount > 0 && (
              <Text style={styles.lineCount}>{lineCount} タスク</Text>
            )}
          </View>
        </View>

        {/* Voice input + example buttons */}
        <View style={styles.actionRow}>
          {voiceSupported && (
            <TouchableOpacity
              style={[styles.voiceButton, isListening && styles.voiceButtonActive]}
              onPress={isListening ? stopVoiceInput : startVoiceInput}
            >
              <Text style={[styles.voiceButtonText, isListening && styles.voiceButtonTextActive]}>
                {isListening ? '⏹ 録音停止' : '🎤 声で入力'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.exampleButton}
            onPress={() => setInput(exampleTasks)}
          >
            <Text style={styles.exampleButtonText}>例文を使う</Text>
          </TouchableOpacity>
        </View>

        {isListening && (
          <View style={styles.listeningBox}>
            <View style={styles.listeningHeader}>
              <Text style={styles.listeningText}>🎙 録音中</Text>
              <Text style={styles.recordingTime}>{formatTime(recordingSeconds)}</Text>
            </View>
            {interimText ? (
              <Text style={styles.interimText}>{interimText}</Text>
            ) : (
              <Text style={styles.listeningHint}>話してください... ゆっくりでOKです</Text>
            )}
            <Text style={styles.listeningExamples}>
              例:「あさっての午後イチにミーティング」「今週中にレポート」「さくっと30分で掃除」
            </Text>
          </View>
        )}

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
  inputFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 8,
  },
  lineCount: {
    fontSize: 12,
    color: '#94A3B8',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  voiceButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  voiceButtonActive: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  voiceButtonText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
  voiceButtonTextActive: {
    color: '#FFF',
  },
  exampleButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
  },
  exampleButtonText: { color: '#3B82F6', fontSize: 13, fontWeight: '600' },
  listeningBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  listeningHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  listeningText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '600',
  },
  recordingTime: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  interimText: {
    color: '#1E293B',
    fontSize: 15,
    fontWeight: '500',
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  listeningHint: {
    color: '#9CA3AF',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 4,
  },
  listeningExamples: {
    color: '#B0B0B0',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
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
