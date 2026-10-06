import { createClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !anonKey) throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (see .env)")

/** The app has no accounts: the client only calls edge functions with the anon key. */
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
