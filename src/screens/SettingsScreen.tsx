// Screen 5: Settings - connection status, AI provider, debug info
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { checkEnv } from '../utils/envCheck';
import { Screen } from '../types';

interface Props {
  onNavigate: (screen: Screen) => void;
}

export function SettingsScreen({ onNavigate }: Props) {
  const { user, accessToken } = useAuth();
  const [envResult] = useState(() => checkEnv());

  const aiProvider = process.env.EXPO_PUBLIC_AI_PROVIDER || '未設定';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => onNavigate('dashboard')}>
          <Text style={styles.backButton}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>設定</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Connection status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>連携状態</Text>
          <View style={styles.card}>
            <SettingRow
              label="Googleアカウント"
              value={user ? `${user.name} (${user.email})` : '未接続'}
              status={!!user}
            />
            <SettingRow
              label="Calendar API"
              value={accessToken ? 'アクセス可能' : '未認証'}
              status={!!accessToken}
            />
            <SettingRow
              label="AIプロバイダ"
              value={aiProvider}
              status={aiProvider !== '未設定'}
            />
          </View>
        </View>

        {/* Environment variables */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>環境変数</Text>
          <View style={styles.card}>
            {Object.entries(envResult.values).map(([key, val]) => (
              <View key={key} style={styles.envRow}>
                <Text style={styles.envKey}>{key}</Text>
                <Text style={styles.envVal}>{val}</Text>
              </View>
            ))}
            {envResult.missing.length > 0 && (
              <View style={styles.envMissing}>
                <Text style={styles.envMissingTitle}>不足:</Text>
                {envResult.missing.map((key) => (
                  <Text key={key} style={styles.envMissingKey}>{key}</Text>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Debug info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>デバッグ情報</Text>
          <View style={styles.card}>
            <SettingRow label="プラットフォーム" value="Web (Expo)" status={true} />
            <SettingRow
              label="Redirect URI"
              value={typeof window !== 'undefined' ? window.location.origin : 'N/A'}
              status={true}
            />
            <SettingRow
              label="タイムゾーン"
              value={Intl.DateTimeFormat().resolvedOptions().timeZone}
              status={true}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function SettingRow({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: boolean;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingRowLeft}>
        <Text style={[styles.statusDot, { color: status ? '#16A34A' : '#DC2626' }]}>
          {status ? '●' : '○'}
        </Text>
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
      <Text style={styles.settingValue} numberOfLines={1}>
        {value}
      </Text>
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
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 12 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 4,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  settingRowLeft: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { fontSize: 10, marginRight: 8 },
  settingLabel: { fontSize: 14, color: '#374151', fontWeight: '500' },
  settingValue: { fontSize: 13, color: '#64748B', maxWidth: 200, textAlign: 'right' },
  envRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  envKey: { fontSize: 11, color: '#6B7280', fontFamily: 'monospace', flex: 1 },
  envVal: { fontSize: 11, color: '#374151', fontFamily: 'monospace' },
  envMissing: {
    padding: 10,
    backgroundColor: '#FEF2F2',
  },
  envMissingTitle: { fontSize: 12, fontWeight: '700', color: '#DC2626', marginBottom: 4 },
  envMissingKey: { fontSize: 11, color: '#7F1D1D', fontFamily: 'monospace' },
});
