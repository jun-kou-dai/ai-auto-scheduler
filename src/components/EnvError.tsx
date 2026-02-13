// Phase A2: Display missing env vars (never crash, always show UI)
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

interface Props {
  missing: string[];
}

export function EnvError({ missing }: Props) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.icon}>⚙</Text>
      <Text style={styles.title}>環境変数が不足しています</Text>
      <Text style={styles.subtitle}>
        .env ファイルに以下のキーを設定してください
      </Text>
      <View style={styles.list}>
        {missing.map((key) => (
          <View key={key} style={styles.item}>
            <Text style={styles.bullet}>✕</Text>
            <Text style={styles.key}>{key}</Text>
          </View>
        ))}
      </View>
      <View style={styles.helpBox}>
        <Text style={styles.helpTitle}>設定方法：</Text>
        <Text style={styles.helpText}>
          1. プロジェクト直下に .env ファイルを作成{'\n'}
          2. 以下の形式でキーを記入：{'\n'}
          {'   '}EXPO_PUBLIC_GOOGLE_CLIENT_ID=your_client_id{'\n'}
          {'   '}EXPO_PUBLIC_AI_PROVIDER=gemini{'\n'}
          {'   '}EXPO_PUBLIC_AI_API_KEY=your_api_key{'\n'}
          3. サーバーを再起動（npx expo start -c）
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBEB',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#78350F',
    marginBottom: 24,
    textAlign: 'center',
  },
  list: {
    width: '100%',
    maxWidth: 400,
    marginBottom: 24,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  bullet: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 14,
    marginRight: 8,
  },
  key: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
    fontFamily: 'monospace',
  },
  helpBox: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  helpTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  helpText: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 20,
    fontFamily: 'monospace',
  },
});
