import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { User } from "@supabase/supabase-js"
import { supabase } from "../data/supabase"

interface AuthState {
  /** The signed-in user, or null when signed out. */
  user: User | null
  /** False until the stored session (or the ?code= of an OAuth redirect) has been read. */
  ready: boolean
}

const AuthContext = createContext<AuthState>({ user: null, ready: false })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, ready: false })

  useEffect(() => {
    // Fires INITIAL_SESSION once the session is loaded, then on every sign-in, sign-out and refresh.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ user: session?.user ?? null, ready: true })
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
