import { adminGuard, createBaseServer, createVersionRouter, openDb } from '@opensteward/shared'
import axios from 'axios'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { Config } from '../config'
import { DeliveryStore } from './db/delivery-store'
import { forwardableHeaders } from './forward-headers'
import { buildTargetUrl } from './target-url'
import { RetryWorker } from './workers/retry-worker'

export async function buildServer(config: Config) {
  const fastify = await createBaseServer({ contentSecurityPolicy: false })
  const handle = await openDb({
    databaseUrl: config.db.databaseUrl,
    sqlitePath: config.db.sqlitePath,
    poolMax: config.db.poolMax,
  })
  const deliveryStore = await DeliveryStore.create(handle)
  const retryWorker = new RetryWorker(deliveryStore)

  // Admin endpoints (log + DLQ) reveal captured webhook bodies and can
  // re-trigger arbitrary outbound deliveries. Gate them with the same
  // ADMIN_SECRET guard the integration-server uses on /admin/*.
  // The receiver POST /webhooks/:platform is intentionally unauthenticated
  // (caller can't know the operator's admin secret); downstream verticals
  // verify HMAC signatures.
  const adminPreHandler = async (
    request: import('fastify').FastifyRequest,
    reply: import('fastify').FastifyReply,
  ): Promise<void> => {
    if (!adminGuard(request, reply)) return reply
  }

  // Webhook receiver — POST /webhooks/:platform. Encapsulated so only this
  // route takes every body as raw bytes: signatures are computed over the
  // exact bytes the platform sent, so the gateway must relay them unparsed.
  // The admin routes below keep Fastify's JSON parsing.
  await fastify.register(async (scope) => {
    scope.removeAllContentTypeParsers()
    scope.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => {
      done(null, body)
    })

    scope.post<{ Params: { platform: string }; Body: Buffer | undefined }>(
      '/webhooks/:platform',
      async (request, reply) => {
        const { platform } = request.params
        const platformConfig = config.platforms[platform]
        if (!platformConfig) {
          return reply.status(404).send({ error: `Unknown platform: ${platform}` })
        }

        const payload = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0)
        const headers = {
          'content-type': 'application/json',
          ...forwardableHeaders(request.headers),
        }
        const targetUrl = buildTargetUrl(platformConfig.url, platformConfig.vertical, platform)
        const deliveryId = await deliveryStore.createDelivery(
          platform,
          platformConfig.vertical,
          targetUrl,
          payload,
          headers,
        )

        try {
          const response = await axios.post(targetUrl, payload, {
            headers,
            // Bytes out exactly as they came in: no JSON re-encoding.
            transformRequest: [(data: Buffer) => data],
            timeout: 10_000,
            validateStatus: () => true,
          })
          if (response.status >= 200 && response.status < 300) {
            await deliveryStore.markDelivered(deliveryId, response.status)
            return reply.status(200).send({ status: 'delivered', deliveryId })
          }
          await deliveryStore.markFailed(deliveryId, response.status, `HTTP ${response.status}`)
          return reply.status(202).send({ status: 'queued_for_retry', deliveryId })
        } catch (err) {
          await deliveryStore.markFailed(deliveryId, null, String(err))
          return reply.status(202).send({ status: 'queued_for_retry', deliveryId })
        }
      },
    )
  })

  // Health endpoint
  fastify.get('/health', async () => ({ status: 'ok' }))

  // /version — see apps/admin-api/src/core/server.ts for the rationale.
  const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
    name?: string
    version?: string
  }
  await fastify.register(
    createVersionRouter({
      name: pkg.name ?? 'webhook-gateway',
      version: pkg.version ?? '0.0.0',
    }),
  )

  // Delivery log — admin-only.
  fastify.get('/webhooks/log', { preHandler: adminPreHandler }, async () => {
    return { data: await deliveryStore.listRecent() }
  })

  // Dead-letter queue — admin-only.
  fastify.get('/webhooks/dlq', { preHandler: adminPreHandler }, async () => {
    return { data: await deliveryStore.listDLQ() }
  })

  // Retry a DLQ item — admin-only.
  fastify.post<{ Params: { id: string } }>(
    '/webhooks/dlq/:id/retry',
    { preHandler: adminPreHandler },
    async (request, reply) => {
      const ok = await deliveryStore.retryDLQ(request.params.id)
      if (!ok) return reply.status(404).send({ error: 'Delivery not found in DLQ' })
      return reply.send({ status: 'queued_for_retry' })
    },
  )

  return { fastify, deliveryStore, retryWorker }
}
