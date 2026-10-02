import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin, type ResolvedConfig } from 'vite'
import { en, type MessageKey } from './src/i18n/locales/en.ts'
import { absoluteUrl, fill, findsMeta, homeMeta, metaHtml, notFoundMeta, SITE_NAME, speciesMeta, type PageMeta } from './src/seo.ts'

const LOCAL_DATASET = fileURLToPath(new URL('../data/mushrooms.json', import.meta.url))

/** In dev, serve the repo's data/mushrooms.json so a fresh export shows up without pushing it. */
function localDataset(): Plugin {
  return {
    name: 'local-dataset',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/data/mushrooms.json', async (_req, res, next) => {
        try {
          res.setHeader('Content-Type', 'application/json')
          res.end(await readFile(LOCAL_DATASET))
        } catch (e) {
          next(e)
        }
      })
    },
  }
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
  const block = (meta: PageMeta) => `${SEO_START}\n    ${metaHtml(meta, siteUrl)}\n    ${SEO_END}`

  return {
    name: 'seo-pages',
    configResolved(resolved) {
      config = resolved
      const origin = loadEnv(resolved.mode, resolved.envDir || resolved.root, 'VITE_').VITE_SITE_ORIGIN ?? ''
      siteUrl = origin + resolved.base
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

      const { mushrooms } = JSON.parse(await readFile(LOCAL_DATASET, 'utf8')) as {
        mushrooms: Parameters<typeof speciesMeta>[0][]
      }
      const indexed = [homeMeta(t), findsMeta(t), ...mushrooms.map((m) => speciesMeta(m, t))]
      for (const meta of indexed.slice(1)) await write(`${meta.path.slice(1)}.html`, page(meta))
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
  plugins: [react(), localDataset(), seoPages()],
})
