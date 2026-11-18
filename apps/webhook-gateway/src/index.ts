import 'dotenv/config'
import { loadConfig } from './config'
import { buildServer } from './core/server'

async function main() {
  const config = loadConfig()
  const { fastify, deliveryStore, retryWorker } = await buildServer(config)

  const port = config.server.port
  const host = config.server.host

  await fastify.listen({ port, host })
  fastify.log.info(`webhook-gateway listening on http://${host}:${port}`)
  fastify.log.info(`Routing ${Object.keys(config.platforms).length} platform(s)`)
  retryWorker.start()

  const shutdown = async () => {
    fastify.log.info('Shutting down...')
    retryWorker.stop()
    await deliveryStore.close()
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
