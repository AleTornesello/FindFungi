import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localDataset()],
})
