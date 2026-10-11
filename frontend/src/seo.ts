/**
 * Page metadata shared by the browser (usePageMeta keeps the head in sync while navigating)
 * and the build (vite.config.ts writes it into a static HTML file per route, for crawlers
 * and link previews that don't run JavaScript). Keep this module free of browser-only code.
 */

import type { MessageKey } from "./i18n/locales/en.ts"

export const SITE_NAME = "FindFungi"

export interface PageMeta {
  /** Full document title. */
  title: string
  description: string
  /** Route path inside the app, e.g. "/species/139". */
  path: string
  /** Absolute URL of a preview image; pages without one share DEFAULT_IMAGE. */
  image?: string
  type?: "website" | "article"
  /** Keep the page out of search results (not-found pages). */
  noindex?: boolean
  /** Open Graph locale, e.g. "en_US". */
  locale?: string
}

export const withSiteName = (title: string) => `${title} · ${SITE_NAME}`

/** Site-wide preview image in public/, 1200×630 as link previews expect. */
const DEFAULT_IMAGE = { path: "/og-image.png", width: "1200", height: "630" }

/** Search engines cut descriptions at around 160 characters. */
const MAX_DESCRIPTION = 160

/** Shortens text to at most `max` characters at a word boundary, ending with an ellipsis. */
export function clampText(text: string, max = MAX_DESCRIPTION) {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,;:.]+$/, "") + "…"
}

export const OG_LOCALES: Record<string, string> = { en: "en_US", it: "it_IT" }

/** Absolute URL of an app path; `siteUrl` is origin plus base path, with or without a trailing slash. */
export const absoluteUrl = (siteUrl: string, path: string) => siteUrl.replace(/\/$/, "") + path

/** Fills {placeholders} in a message template. */
export const fill = (template: string, params: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match)

type Tag = { tag: "meta" | "link"; key: "name" | "property" | "rel"; id: string; attr: "content" | "href"; value?: string }

/** The head tags a page owns, in a form both the DOM updater and the HTML writer can apply. */
export function metaTags(meta: PageMeta, siteUrl: string): Tag[] {
  const url = absoluteUrl(siteUrl, meta.path)
  const description = clampText(meta.description)
  const defaultImage = meta.image === undefined
  const image = meta.image ?? absoluteUrl(siteUrl, DEFAULT_IMAGE.path)
  return [
    { tag: "meta", key: "name", id: "description", attr: "content", value: description },
    { tag: "meta", key: "name", id: "robots", attr: "content", value: meta.noindex ? "noindex" : undefined },
    { tag: "link", key: "rel", id: "canonical", attr: "href", value: meta.noindex ? undefined : url },
    { tag: "meta", key: "property", id: "og:site_name", attr: "content", value: SITE_NAME },
    { tag: "meta", key: "property", id: "og:type", attr: "content", value: meta.type ?? "website" },
    { tag: "meta", key: "property", id: "og:title", attr: "content", value: meta.title },
    { tag: "meta", key: "property", id: "og:description", attr: "content", value: description },
    { tag: "meta", key: "property", id: "og:url", attr: "content", value: url },
    { tag: "meta", key: "property", id: "og:image", attr: "content", value: image },
    { tag: "meta", key: "property", id: "og:image:width", attr: "content", value: defaultImage ? DEFAULT_IMAGE.width : undefined },
    { tag: "meta", key: "property", id: "og:image:height", attr: "content", value: defaultImage ? DEFAULT_IMAGE.height : undefined },
    { tag: "meta", key: "property", id: "og:image:alt", attr: "content", value: meta.title },
    { tag: "meta", key: "property", id: "og:locale", attr: "content", value: meta.locale ?? OG_LOCALES.en },
    { tag: "meta", key: "name", id: "twitter:card", attr: "content", value: "summary_large_image" },
    { tag: "meta", key: "name", id: "twitter:title", attr: "content", value: meta.title },
    { tag: "meta", key: "name", id: "twitter:description", attr: "content", value: description },
    { tag: "meta", key: "name", id: "twitter:image", attr: "content", value: image },
    { tag: "meta", key: "name", id: "twitter:image:alt", attr: "content", value: meta.title },
  ]
}

type Translate = (key: MessageKey, params?: Record<string, string>) => string

interface SpeciesFields {
  id: number
  taxonomy: { genus: string; species: string; family: string }
  properties: { edible: boolean; poisonous?: boolean; images: { url: string }[] }
}

export const homeMeta = (t: Translate): PageMeta => ({
  title: `${SITE_NAME} · ${t("seo.homeTitle")}`,
  description: t("seo.homeDescription"),
  path: "/",
})

export const findsMeta = (t: Translate): PageMeta => ({
  title: withSiteName(t("finds.title")),
  description: t("seo.findsDescription"),
  path: "/finds",
})

export const disclaimerMeta = (t: Translate): PageMeta => ({
  title: withSiteName(t("legal.title")),
  description: t("seo.disclaimerDescription"),
  path: "/disclaimer",
})

export const termsMeta = (t: Translate): PageMeta => ({
  title: withSiteName(t("terms.title")),
  description: t("seo.termsDescription"),
  path: "/terms",
})

export const privacyMeta = (t: Translate): PageMeta => ({
  title: withSiteName(t("privacy.title")),
  description: t("seo.privacyDescription"),
  path: "/privacy",
})

/** Nothing on the login page is worth a search result. */
export const loginMeta = (t: Translate): PageMeta => ({
  title: withSiteName(t("login.title")),
  description: t("seo.loginDescription"),
  path: "/login",
  noindex: true,
})

export const notFoundMeta = (
  t: Translate,
  path: string,
  [title, body]: [MessageKey, MessageKey] = ["notFound.title", "notFound.body"],
): PageMeta => ({
  title: withSiteName(t(title)),
  description: t(body),
  path,
  noindex: true,
})

export function speciesMeta(m: SpeciesFields, t: Translate): PageMeta {
  const name = `${m.taxonomy.genus} ${m.taxonomy.species}`.trim()
  const edibility = t(
    m.properties.poisonous ? "edibility.poisonous" : m.properties.edible ? "edibility.edible" : "edibility.inedible",
  ).toLowerCase()
  const family = m.taxonomy.family
  return {
    title: withSiteName(name),
    description: family
      ? t("seo.speciesDescription", { name, family, edibility })
      : t("seo.speciesDescriptionNoFamily", { name, edibility }),
    path: `/species/${m.id}`,
    image: m.properties.images[0]?.url,
    type: "article",
  }
}

const escapeHtml =(s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** The page's head tags as HTML, for the static files written at build time. */
export function metaHtml(meta: PageMeta, siteUrl: string): string {
  const tags = metaTags(meta, siteUrl)
    .filter((t) => t.value !== undefined)
    .map((t) => `<${t.tag} ${t.key}="${t.id}" ${t.attr}="${escapeHtml(t.value!)}" />`)
  return [`<title>${escapeHtml(meta.title)}</title>`, ...tags].join("\n    ")
}
