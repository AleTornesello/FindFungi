import { createClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !anonKey) throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (see .env)")

/**
 * Signing in is optional: without a session the client calls edge functions with the anon key.
 * PKCE, because Google and the confirmation emails send users back to the app with a ?code=
 * that the client exchanges for a session on load.
 */
export const supabase = createClient(url, anonKey, {
  auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

/** Where Google and the confirmation emails send users back to; it must be in Supabase's redirect URLs. */
export const AUTH_REDIRECT_URL = window.location.origin + import.meta.env.BASE_URL
