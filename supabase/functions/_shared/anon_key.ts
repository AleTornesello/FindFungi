// Shared by the edge functions that accept both anonymous and signed-in requests.

/**
 * Whether the token is the project's anon key, recognized by the role in its payload: the
 * runtime's SUPABASE_ANON_KEY may hold another key than the one the app sends, and getClaims
 * rejects the anon key. The signature isn't checked, which is safe: claiming to be anonymous
 * gets nothing more than being anonymous.
 */
export function isAnonKey(token: string): boolean {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)).role === "anon";
  } catch {
    return false;
  }
}
