import { FunctionsHttpError } from "@supabase/supabase-js"
import { supabase } from "./supabase"
import type { Locale } from "../i18n/locales"

/**
 * Parts of a species page a report can be about. The same list as the check on
 * species_reports.field and REPORT_FIELDS in supabase/functions/report-issue/report.ts.
 */
export const REPORT_FIELDS = [
  "commonNameIt",
  "commonNameEn",
  "edibility",
  "toxicity",
  "cap",
  "hymenium",
  "lamella",
  "stipe",
  "gleba",
  "sporePrint",
  "ecology",
  "conservationStatus",
  "taxonomy",
  "photos",
  "other",
] as const

export type ReportField = (typeof REPORT_FIELDS)[number]

export type ReportKind = "missing" | "wrong"

/** Lengths the species_reports table accepts, checked by the form before sending. */
export const MESSAGE_MIN = 5
export const MESSAGE_MAX = 2000
export const SOURCE_MAX = 500

export interface Report {
  mushroomId: number
  scientificName: string
  kind: ReportKind
  /** Null for the species as a whole. */
  field: ReportField | null
  message: string
  /** Where the right information comes from; '' when not given. */
  source: string
  locale: Locale
  /** The hidden field bots fill in; always '' when a person sends the form. */
  website: string
}

/** Why a report wasn't sent: too many in a short time, an expired session, or anything else. */
export type ReportError = "rateLimited" | "session" | "failed"

/** Supabase edge function that stores reports (supabase/functions/report-issue). */
const REPORT_FUNCTION = "report-issue"

/**
 * Sends the report. Supabase sends the session token when a user is signed in, and the edge
 * function saves their user id with it; the anon key otherwise. Resolves to null once stored.
 */
export async function sendReport(report: Report): Promise<ReportError | null> {
  const { error } = await supabase.functions.invoke(REPORT_FUNCTION, { body: report })
  if (!error) return null
  const status = error instanceof FunctionsHttpError ? (error.context as Response).status : undefined
  if (status === 429) return "rateLimited"
  if (status === 401) return "session"
  return "failed"
}
