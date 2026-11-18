/**
 * Boot entrypoint. Reads config, builds the server, listens.
 */
import 'dotenv/config'
import { loadConfig } from './config'
import { buildServer } from './server'

async function main(): Promise<void> {
  const config = loadConfig()
  const {
    fastify,
    webhookWorker,
    syncWorkers,
    syncScheduler,
    dataStoreMaintenance,
    refreshKeepAliveWorker,
    destinationWorker,
    closeStores,
  } = await buildServer(config)

  try {
    await fastify.listen({ port: config.port, host: config.host })
    fastify.log.info(
      { port: config.port, host: config.host },
      'opensteward listening',
    )
  } catch (err) {
    fastify.log.error({ err }, 'failed to start')
    process.exit(1)
  }

  // Drain pending webhook deliveries on a 5s interval. Idempotent restarts
  // pick up where the previous process left off (state lives in sqlite).
  webhookWorker.start()
  // Per-vertical sync workers. No-ops in passthrough mode (array is empty).
  // start() is async (it recovers orphaned RUNNING jobs); fire-and-forget at
  // boot to keep startup non-blocking.
  for (const w of syncWorkers) void w.start()
  // Scheduled syncs (no-op in passthrough mode). After the workers, so the
  // first tick's jobs have someone to run them.
  syncScheduler?.start()
  // Destination exports (warehouse/lake). Undefined in passthrough mode or
  // with DESTINATIONS_WORKER=off.
  destinationWorker?.start()
  // Daily proactive refresh of every active OAuth connection. Disable via
  // `REFRESH_WORKER_ENABLED=false`.
  refreshKeepAliveWorker?.start()

  // Graceful shutdown — stop polling before fastify closes its db handle.
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.on(sig, () => {
      fastify.log.info({ sig }, 'shutting down')
      webhookWorker.stop()
      dataStoreMaintenance?.stop()
      refreshKeepAliveWorker?.stop()
      void Promise.all([
        syncScheduler?.stop(),
        ...syncWorkers.map((w) => w.stop()),
        destinationWorker?.stop(),
      ]).then(() =>
        fastify.close().then(async () => {
          // Close the shared DbHandle(s) last so anything still in the pipe
          // (logs, final writes) flushes through fastify first.
          try {
            await closeStores()
          } catch {
            /* nothing to do — process is exiting */
          }
          process.exit(0)
        }),
      )
    })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
