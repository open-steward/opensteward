/**
 * Regression: UnifiedClient POSTs that take no API-level body must still send
 * a JSON body to the integration-server.
 *
 * axios applies its default `Content-Type: application/x-www-form-urlencoded`
 * to a POST issued with no `data` argument. The integration-server (a stock
 * Fastify app) only parses `application/json` / `text/plain`, so a bodyless
 * POST is rejected with 415 — which the admin-api surfaces to the operator as
 * a 502. This bit the setup wizard: enabling one adapter reconciles the rest
 * via `disablePlatform`, and every disable 415'd.
 *
 * These tests stand up a minimal JSON-only Fastify server (same default
 * content-type behaviour as the integration-server) and assert each
 * historically-bodyless client method reaches its handler with a JSON body.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { UnifiedClient } from '../../src/core/proxy/client'

describe('UnifiedClient bodyless POSTs send application/json (no 415)', () => {
  let server: FastifyInstance
  let client: UnifiedClient
  const seen: Array<{ url: string; contentType?: string }> = []

  beforeAll(async () => {
    server = Fastify({ logger: false })
    // Record the Content-Type the client actually sent, then 200. A request
    // whose content-type has no parser never reaches here — Fastify 415s it.
    const record = async (request: { url: string; headers: Record<string, unknown> }) => {
      seen.push({ url: request.url, contentType: request.headers['content-type'] as string })
      return { ok: true, data: { id: 'job_1' } }
    }
    server.post('/admin/platforms/:vertical/:slug/disable', record)
    server.post('/admin/sync-jobs/:id/cancel', record)
    server.post('/internal/runtime-settings/refresh', record)

    const address = await server.listen({ port: 0, host: '127.0.0.1' })
    client = new UnifiedClient({ url: address })
  })

  afterAll(async () => {
    await server.close()
  })

  function hitFor(fragment: string) {
    return seen.find((s) => s.url.includes(fragment))
  }

  it('disablePlatform reaches the handler with a JSON body', async () => {
    await client.disablePlatform('accounting', 'fortnox')
    const hit = hitFor('/disable')
    expect(hit).toBeDefined()
    expect(hit!.contentType).toMatch(/application\/json/)
  })

  it('cancelSyncJob reaches the handler with a JSON body', async () => {
    await client.cancelSyncJob('job_1')
    const hit = hitFor('/cancel')
    expect(hit).toBeDefined()
    expect(hit!.contentType).toMatch(/application\/json/)
  })

  it('refreshRuntimeSettings reaches the handler (best-effort, must not 415)', async () => {
    await client.refreshRuntimeSettings()
    const hit = hitFor('/runtime-settings/refresh')
    expect(hit).toBeDefined()
    expect(hit!.contentType).toMatch(/application\/json/)
  })
})
