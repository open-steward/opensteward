import 'dotenv/config'
import { resolve } from 'path'
import { buildServer } from './server.js'

const PORT = parseInt(process.env.PORT ?? '3003', 10)
const HOST = process.env.HOST ?? '0.0.0.0'
const DOCS_DIR = resolve(import.meta.dirname, '..', '..', '..', 'docs', 'openapi')
const PROVIDERS_DIR = resolve(import.meta.dirname, '..', '..', '..', 'docs', 'platforms')
const GUIDES_DIR = resolve(import.meta.dirname, '..', '..', '..', 'docs')

async function main() {
  const fastify = await buildServer({
    docsDir: DOCS_DIR,
    providersDir: PROVIDERS_DIR,
    guidesDir: GUIDES_DIR,
  })

  await fastify.listen({ port: PORT, host: HOST })
  fastify.log.info(`docs-server listening on http://${HOST}:${PORT}`)

  const shutdown = async () => {
    await fastify.close()
    process.exit(0)
  }
  process.on('SIGTERM', () => { void shutdown() })
  process.on('SIGINT', () => { void shutdown() })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
