import { useEffect } from "react"
import { useI18n } from "../i18n/I18nProvider"
import { metaTags, OG_LOCALES, type PageMeta } from "../seo"

const SITE_URL = (import.meta.env.VITE_SITE_ORIGIN ?? window.location.origin) + import.meta.env.BASE_URL

/** Keeps the document title and the page's head tags in step with the route; null leaves them as they are. */
export function usePageMeta(meta: PageMeta | null) {
  const { locale } = useI18n()
  const key = meta && JSON.stringify(meta)

  useEffect(() => {
    if (!key) return
    const page: PageMeta = { locale: OG_LOCALES[locale], ...(JSON.parse(key) as PageMeta) }
    document.title = page.title
    for (const tag of metaTags(page, SITE_URL)) {
      const selector = `${tag.tag}[${tag.key}="${tag.id}"]`
      let el = document.head.querySelector(selector)
      if (tag.value === undefined) {
        el?.remove()
        continue
      }
      if (!el) {
        el = document.createElement(tag.tag)
        el.setAttribute(tag.key, tag.id)
        document.head.append(el)
      }
      el.setAttribute(tag.attr, tag.value)
    }
  }, [key, locale])
}
