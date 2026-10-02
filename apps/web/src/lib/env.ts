function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function getPublicEnv() {
  return {
    supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}

export function getSupabaseUrl() {
  return required("NEXT_PUBLIC_SUPABASE_URL");
}

export function getServiceRoleKey() {
  return required("SUPABASE_SERVICE_ROLE_KEY");
}

export function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_2 || required("GEMINI_API_KEY");
}

export function getGeminiApiKeys() {
  const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].filter((value): value is string => Boolean(value));
  if (!keys.length) throw new Error("Missing environment variable: GEMINI_API_KEY");
  return [...new Set(keys)];
}
