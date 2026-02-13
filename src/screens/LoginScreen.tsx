// Screen 1: Landing/Login
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export function LoginScreen() {
  const { login, isLoading, isReady, error } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>AI Auto Scheduler</Text>
        <Text style={styles.tagline}>
          タスクを入力するだけで{'\n'}AIがスケジュールを自動作成
        </Text>
      </View>

      <View style={styles.features}>
        <FeatureItem icon="1" text="タスクをざっくり入力" />
        <FeatureItem icon="2" text="AIが重要度・所要時間を推定" />
        <FeatureItem icon="3" text="空き時間に自動配置" />
        <FeatureItem icon="4" text="承認でカレンダーに反映" />
      </View>

      <View style={styles.loginSection}>
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.loginButton, (isLoading || !isReady) && styles.loginButtonDisabled]}
          onPress={login}
          disabled={isLoading || !isReady}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.loginButtonText}>GOOGLEでログイン</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.note}>
          Google Calendar へのアクセス許可が必要です
        </Text>
      </View>
    </View>
  );
}

function FeatureItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureItem}>
      <View style={styles.featureIcon}>
        <Text style={styles.featureIconText}>{icon}</Text>
      </View>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 12,
  },
  tagline: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 24,
  },
  features: {
    width: '100%',
    maxWidth: 360,
    marginBottom: 40,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  featureIconText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  featureText: {
    fontSize: 14,
    color: '#475569',
  },
  loginSection: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    width: '100%',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    textAlign: 'center',
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4285F4',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  googleIcon: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 18,
    marginRight: 10,
  },
  loginButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  note: {
    marginTop: 12,
    fontSize: 12,
    color: '#94A3B8',
  },
});
