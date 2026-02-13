// Phase B: Auth context with Google login (Web only)
// Fixes: token persistence, request-ready check, onLogout callback
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { UserInfo } from '../types';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';
const STORAGE_KEY_TOKEN = 'ai_scheduler_access_token';
const STORAGE_KEY_USER = 'ai_scheduler_user';

// Safe localStorage access (SSR-safe)
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

// Google OAuth discovery document
const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

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

// Restore user from localStorage
function getRestoredUser(): UserInfo | null {
  const stored = getStoredValue(STORAGE_KEY_USER);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch { /* ignore */ }
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(getRestoredUser);
  const [accessToken, setAccessToken] = useState<string | null>(() => getStoredValue(STORAGE_KEY_TOKEN));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoutCallbacksRef = useRef<(() => void)[]>([]);

  // Build redirect URI for web
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'ai-auto-scheduler',
  });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      scopes: [
        'openid',
        'profile',
        'email',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ],
      redirectUri,
      responseType: AuthSession.ResponseType.Token,
    },
    discovery
  );

  // Handle auth response
  useEffect(() => {
    if (response?.type === 'success') {
      const { access_token } = response.params;
      if (access_token) {
        setAccessToken(access_token);
        setStoredValue(STORAGE_KEY_TOKEN, access_token);
        fetchUserInfo(access_token);
      }
    } else if (response?.type === 'error') {
      setError(`ログインエラー: ${response.error?.message || '不明なエラー'}`);
      setIsLoading(false);
    } else if (response?.type === 'dismiss') {
      setIsLoading(false);
    }
  }, [response]);

  // Validate restored token on mount
  useEffect(() => {
    if (accessToken && !user) {
      fetchUserInfo(accessToken);
    }
  }, []);

  const fetchUserInfo = useCallback(async (token: string) => {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        // Token expired or invalid — clear it
        if (res.status === 401) {
          setAccessToken(null);
          setUser(null);
          setStoredValue(STORAGE_KEY_TOKEN, null);
          setStoredValue(STORAGE_KEY_USER, null);
          setError('セッションが期限切れです。再度ログインしてください。');
          setIsLoading(false);
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
    if (!request) {
      setError('認証の準備中です。少し待ってから再度お試しください。');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await promptAsync();
    } catch (err) {
      setError(`ログイン開始エラー: ${err instanceof Error ? err.message : String(err)}`);
      setIsLoading(false);
    }
  }, [promptAsync, request]);

  const logout = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    setError(null);
    setStoredValue(STORAGE_KEY_TOKEN, null);
    setStoredValue(STORAGE_KEY_USER, null);
    // Call registered logout callbacks
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
        isReady: !!request,
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
