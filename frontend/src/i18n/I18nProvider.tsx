import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { en, type MessageKey } from "./locales/en"
import { FALLBACK_LOCALE, isLocale, LOCALES, type Locale } from "./locales"

const STORAGE_KEY = "findfungi.locale"

type Params = Record<string, string | number>

interface I18nState {
  locale: Locale
  setLocale: (locale: Locale) => void
  /** Translated message with {placeholders} filled in; numbers are formatted for the locale. */
  t: (key: MessageKey, params?: Params) => string
}

const I18nContext = createContext<I18nState | null>(null)

function readStoredLocale(): Locale | undefined {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isLocale(stored) ? stored : undefined
  } catch {
    return undefined // Storage blocked (private mode, disabled cookies).
  }
}

/** First browser language we support, matching "it-IT" to "it" when there's no exact entry. */
function browserLocale(): Locale | undefined {
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const tag of preferred) {
    if (!tag) continue
    const lower = tag.toLowerCase()
    if (isLocale(lower)) return lower
    const base = lower.split("-")[0]
    if (isLocale(base)) return base
  }
}

/** The user's last explicit choice wins; otherwise follow the browser, then English. */
const initialLocale = () => readStoredLocale() ?? browserLocale() ?? FALLBACK_LOCALE

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Not persisted, but still applies for this session.
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const t = useMemo(() => {
    const messages = LOCALES[locale].messages as Partial<Record<MessageKey, string>>
    const number = new Intl.NumberFormat(locale)
    return (key: MessageKey, params?: Params) => {
      const template = messages[key] ?? en[key] ?? key
      if (!params) return template
      return template.replace(/\{(\w+)\}/g, (match, name: string) => {
        const value = params[name]
        if (value === undefined) return match
        return typeof value === "number" ? number.format(value) : value
      })
    }
  }, [locale])

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>")
  return ctx
}
