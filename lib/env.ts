export function isDemoMode(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return true;
  if (url.includes("YOUR-PROJECT") || key.includes("YOUR-ANON-KEY")) return true;
  return false;
}
