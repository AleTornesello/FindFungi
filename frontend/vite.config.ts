import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin, type ResolvedConfig } from 'vite'
import { en, type MessageKey } from './src/i18n/locales/en.ts'
import {
  absoluteUrl,
  disclaimerMeta,
  fill,
  findsMeta,
  homeMeta,
  loginMeta,
  metaHtml,
  notFoundMeta,
  privacyMeta,
  SITE_NAME,
  speciesMeta,
  termsMeta,
  type PageMeta,
} from './src/seo.ts'

/** The dataset the app loads, from the export-mushrooms edge function (see src/hooks/useMushrooms.tsx). */
async function fetchDataset(env: Record<string, string>): Promise<unknown> {
  const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key } = env
  if (!url || !key) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (see .env)')
  const res = await fetch(`${url}/functions/v1/export-mushrooms`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`Could not download the dataset for the species pages (HTTP ${res.status})`)
  return res.json()
}

const SEO_START = '<!--seo-->'
const SEO_END = '<!--/seo-->'

const t = (key: MessageKey, params?: Record<string, string>) => fill(en[key], params ?? {})

/**
 * Head tags for crawlers and link previews, which mostly don't run the app. index.html gets the
 * home page's; the build also writes an HTML file per route with that route's tags (GitHub Pages
 * serves species/139.html for /species/139), plus 404.html, sitemap.xml and robots.txt.
 * In the browser, usePageMeta takes over the same tags.
 */
function seoPages(): Plugin {
  let config: ResolvedConfig
  let siteUrl: string
  let env: Record<string, string>
  const block = (meta: PageMeta) => `${SEO_START}\n    ${metaHtml(meta, siteUrl)}\n    ${SEO_END}`

  return {
    name: 'seo-pages',
    configResolved(resolved) {
      config = resolved
      env = loadEnv(resolved.mode, resolved.envDir || resolved.root, 'VITE_')
      siteUrl = (env.VITE_SITE_ORIGIN ?? '') + resolved.base
    },
    transformIndexHtml(html) {
      const website = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: siteUrl })
      return html.replace(SEO_START, `${block(homeMeta(t))}\n    <script type="application/ld+json">${website}</script>`)
    },
    async closeBundle() {
      if (config.command !== 'build') return
      const outDir = resolve(config.root, config.build.outDir)
      const template = await readFile(resolve(outDir, 'index.html'), 'utf8')
      const start = template.indexOf(SEO_START)
      const end = template.indexOf(SEO_END) + SEO_END.length
      const page = (meta: PageMeta) => template.slice(0, start) + block(meta) + template.slice(end)
      const write = async (file: string, content: string) => {
        const path = resolve(outDir, file)
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, content)
      }

      const { mushrooms } = (await fetchDataset(env)) as { mushrooms: Parameters<typeof speciesMeta>[0][] }
      const indexed = [homeMeta(t), findsMeta(t), disclaimerMeta(t), termsMeta(t), privacyMeta(t), ...mushrooms.map((m) => speciesMeta(m, t))]
      for (const meta of [...indexed.slice(1), loginMeta(t)]) await write(`${meta.path.slice(1)}.html`, page(meta))
      // Unknown paths still load the app (species added since this build show up there), but stay out of search.
      await write('404.html', page(notFoundMeta(t, '/404')))

      const urls = indexed.map((m) => `  <url><loc>${absoluteUrl(siteUrl, m.path)}</loc></url>`)
      await write(
        'sitemap.xml',
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          `${urls.join('\n')}\n</urlset>\n`,
      )
      await write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl(siteUrl, '/sitemap.xml')}\n`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), seoPages()],
})
