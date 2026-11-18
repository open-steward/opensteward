import 'dotenv/config'
import { loadConfig } from './config'
import { buildServer } from './core/server'

async function main() {
  const config = loadConfig()
  const { fastify, adminStore, healthPoller, auditRetentionWorker, logoFetchWorker } =
    await buildServer(config)

  const port = config.server.port
  const host = config.server.host

  await fastify.listen({ port, host })
  fastify.log.info(`admin-api listening on http://${host}:${port}`)
  healthPoller.start()
  auditRetentionWorker.start()
  logoFetchWorker.start()

  const shutdown = async () => {
    fastify.log.info('Shutting down...')
    healthPoller.stop()
    auditRetentionWorker.stop()
    logoFetchWorker.stop()
    await adminStore.close()
    await fastify.close()
    process.exit(0)
  }
  process.on('SIGTERM', () => {
    void shutdown()
  })
  process.on('SIGINT', () => {
    void shutdown()
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
