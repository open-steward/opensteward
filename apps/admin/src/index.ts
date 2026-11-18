import 'dotenv/config'
import { loadConfig } from './config'
import { buildServer } from './core/server'

async function main() {
  const config = loadConfig()
  const { fastify } = await buildServer(config)

  const port = config.server.port ?? 3000
  const host = config.server.host ?? '0.0.0.0'

  await fastify.listen({ port, host })
  fastify.log.info(`admin listening on http://${host}:${port}`)

  const shutdown = async () => {
    fastify.log.info('Shutting down...')
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
