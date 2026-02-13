// Environment variable validation (Phase A2)
// Checks for required EXPO_PUBLIC_ keys at startup

const REQUIRED_KEYS = [
  'EXPO_PUBLIC_GOOGLE_CLIENT_ID',
  'EXPO_PUBLIC_AI_PROVIDER',
  'EXPO_PUBLIC_AI_API_KEY',
] as const;

export interface EnvCheckResult {
  ok: boolean;
  missing: string[];
  values: Record<string, string>;
}

export function checkEnv(): EnvCheckResult {
  const missing: string[] = [];
  const values: Record<string, string> = {};

  for (const key of REQUIRED_KEYS) {
    const val = (process.env as Record<string, string | undefined>)[key];
    if (!val || val.trim() === '') {
      missing.push(key);
    } else {
      // Mask values for display (show first 8 chars)
      values[key] = val.length > 8 ? val.slice(0, 8) + '...' : val;
    }
  }

  return {
    ok: missing.length === 0,
    missing,
    values,
  };
}
