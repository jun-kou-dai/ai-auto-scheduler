// Auth context — direct redirect approach (same as ai-sukejuru, no Expo AuthSession popup)
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { UserInfo } from '../types';

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';
const SCOPES = 'openid profile email https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events';
const STORAGE_KEY_TOKEN = 'ai_scheduler_access_token';
const STORAGE_KEY_USER = 'ai_scheduler_user';
const STORAGE_KEY_EXPIRES = 'ai_scheduler_token_expires';

function getRedirectUri(): string {
  if (typeof window === 'undefined') return 'http://localhost:8081';
  return window.location.origin + '/ai-auto-scheduler';
}

function getStoredValue(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch { /* ignore */ }
  return null;
}

function setStoredValue(key: string, value: string | null): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (value === null) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, value);
      }
    }
  } catch { /* ignore */ }
}

interface AuthContextType {
  user: UserInfo | null;
  accessToken: string | null;
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => void;
  onLogout: (callback: () => void) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  accessToken: null,
  isLoading: false,
  isReady: false,
  error: null,
  login: async () => {},
  logout: () => {},
  onLogout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

function getRestoredUser(): UserInfo | null {
  // Only restore user if token is still valid
  // This prevents inconsistent state where user exists but accessToken is null
  const token = getStoredValue(STORAGE_KEY_TOKEN);
  const expires = getStoredValue(STORAGE_KEY_EXPIRES);
  if (!token || !expires || Date.now() >= parseInt(expires, 10)) {
    return null;
  }

  const stored = getStoredValue(STORAGE_KEY_USER);
  if (stored) {
    try { return JSON.parse(stored); } catch { /* ignore */ }
  }
  return null;
}

function getRestoredToken(): string | null {
  const token = getStoredValue(STORAGE_KEY_TOKEN);
  const expires = getStoredValue(STORAGE_KEY_EXPIRES);
  if (token && expires && Date.now() < parseInt(expires, 10)) {
    return token;
  }
  if (token) {
    setStoredValue(STORAGE_KEY_TOKEN, null);
    setStoredValue(STORAGE_KEY_EXPIRES, null);
    setStoredValue(STORAGE_KEY_USER, null);
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(getRestoredUser);
  const [accessToken, setAccessToken] = useState<string | null>(getRestoredToken);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoutCallbacksRef = useRef<(() => void)[]>([]);

  // Handle OAuth redirect on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token')) return;

    const params = new URLSearchParams(hash.substring(1));
    const token = params.get('access_token');
    const expiresIn = params.get('expires_in');

    if (token && expiresIn) {
      const expiresAt = Date.now() + parseInt(expiresIn, 10) * 1000;
      setAccessToken(token);
      setStoredValue(STORAGE_KEY_TOKEN, token);
      setStoredValue(STORAGE_KEY_EXPIRES, String(expiresAt));
      fetchUserInfo(token);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  // Validate restored token on mount
  useEffect(() => {
    if (accessToken && !user) {
      fetchUserInfo(accessToken);
    }
  }, []);

  const fetchUserInfo = useCallback(async (token: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401) {
          setAccessToken(null);
          setUser(null);
          setStoredValue(STORAGE_KEY_TOKEN, null);
          setStoredValue(STORAGE_KEY_USER, null);
          setStoredValue(STORAGE_KEY_EXPIRES, null);
          setError('セッションが期限切れです。再度ログインしてください。');
          return;
        }
        throw new Error(`ユーザー情報取得失敗 (${res.status})`);
      }
      const data = await res.json();
      const userInfo: UserInfo = {
        name: data.name || 'Unknown',
        email: data.email || '',
        picture: data.picture || '',
      };
      setUser(userInfo);
      setStoredValue(STORAGE_KEY_USER, JSON.stringify(userInfo));
      setError(null);
    } catch (err) {
      setError(`ユーザー情報取得エラー: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async () => {
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: getRedirectUri(),
      response_type: 'token',
      scope: SCOPES,
      prompt: 'consent',
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    setError(null);
    setStoredValue(STORAGE_KEY_TOKEN, null);
    setStoredValue(STORAGE_KEY_USER, null);
    setStoredValue(STORAGE_KEY_EXPIRES, null);
    for (const cb of logoutCallbacksRef.current) {
      try { cb(); } catch { /* ignore */ }
    }
  }, []);

  const onLogout = useCallback((callback: () => void) => {
    logoutCallbacksRef.current.push(callback);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        isReady: true,
        error,
        login,
        logout,
        onLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
