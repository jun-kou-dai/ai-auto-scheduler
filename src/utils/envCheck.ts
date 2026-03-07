// Environment variable validation (Phase A2)
// Uses static process.env references so Metro bundler can inline values

export interface EnvCheckResult {
  ok: boolean;
  missing: string[];
  values: Record<string, string>;
}

export function checkEnv(): EnvCheckResult {
  // Static references - Metro bundler inlines these at build time
  // Dynamic access like process.env[key] does NOT work with Metro
  const envValues: [string, string | undefined][] = [
    ['EXPO_PUBLIC_GOOGLE_CLIENT_ID', process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID],
    ['EXPO_PUBLIC_AI_PROVIDER', process.env.EXPO_PUBLIC_AI_PROVIDER],
    ['EXPO_PUBLIC_AI_API_KEY', process.env.EXPO_PUBLIC_AI_API_KEY],
  ];

  const missing: string[] = [];
  const values: Record<string, string> = {};

  for (const [key, val] of envValues) {
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
