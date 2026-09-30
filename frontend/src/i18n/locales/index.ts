import { en, type Messages } from "./en"
import { it } from "./it"

/**
 * Supported languages. To add one, create `xx.ts` next to this file (typed as `Messages`)
 * and register it here with its name written in that language.
 */
export const LOCALES = {
  en: { name: "English", messages: en },
  it: { name: "Italiano", messages: it },
} satisfies Record<string, { name: string; messages: Messages }>

export type Locale = keyof typeof LOCALES

export const FALLBACK_LOCALE: Locale = "en"

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && Object.hasOwn(LOCALES, value)
