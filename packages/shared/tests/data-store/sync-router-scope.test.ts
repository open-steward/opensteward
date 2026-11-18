/**
 * Scope behaviour of `POST /v1/{vertical}/sync`.
 *
 * A sync pulls upstream data into the local store and never writes back to the
 * platform, so it does not demand `vertical:write` — the route declares
 * `config: { readSafe: true }` and the auth middleware honours it. See
 * ../control-plane/write-scope-rule.test.ts for that rule.
 *
 * `callback_url` is the exception, and these tests pin why: supplying one makes
 * the deployment issue an outbound POST from inside its own network, which is a
 * different authority from refreshing a cache. It stays behind
 * `vertical:write`, and the URL itself is validated at enqueue time.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { createSyncRouter } from '../../src/data-store/sync-router'
import type { SyncStore } from '../../src/data-store/sync-store'

const JOB = { id: 'job_1', status: 'queued', vertical: 'accounting' }

const syncStore = {
  createIfIdle: async () => ({ job: JOB, created: true }),
} as unknown as SyncStore

let app: FastifyInstance

/** Boot the router with a request decorated the way the auth middleware does. */
async function build(grants: string[] | undefined): Promise<FastifyInstance> {
  app = Fastify({ logger: false })
  app.addHook('preHandler', async (request) => {
    const r = request as unknown as Record<string, unknown>
    r.connectionId = 'conn_1'
    r.platform = 'fortnox'
    r.tenantId = 'tenant-a'
    // No apiKeyId: the per-key sync rate limit is not what these tests cover.
    if (grants) r.apiKeyScopes = grants
  })
  await app.register(createSyncRouter({ vertical: 'accounting', syncStore }))
  await app.ready()
  return app
}

function post(instance: FastifyInstance, payload: Record<string, unknown> = {}) {
  return instance.inject({ method: 'POST', url: '/sync', payload })
}

afterEach(async () => {
  await app?.close()
})

describe('POST /sync scope requirements', () => {
  it('accepts a plain sync from a read-only key', async () => {
    const instance = await build(['vertical:read'])
    const res = await post(instance)
    expect(res.statusCode).toBe(202)
  })

  it('carries the readSafe flag the auth middleware reads', async () => {
    // Asserting the registered route config, not a status code: the middleware
    // is what turns this flag into an allow, and a 202 from this router alone
    // would pass with or without it.
    const configs: Array<Record<string, unknown>> = []
    const instance = Fastify({ logger: false })
    instance.addHook('onRoute', (route) => {
      if (route.url.endsWith('/sync') && route.method === 'POST') {
        configs.push((route.config ?? {}) as Record<string, unknown>)
      }
    })
    await instance.register(createSyncRouter({ vertical: 'accounting', syncStore }))
    await instance.ready()
    await instance.close()
    expect(configs).toHaveLength(1)
    expect(configs[0]?.readSafe).toBe(true)
  })

  it('refuses a callback_url from a read-only key', async () => {
    const instance = await build(['vertical:read'])
    const res = await post(instance, { callback_url: 'https://hooks.acme.example/done' })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('INSUFFICIENT_SCOPE')
    expect(res.json().error.requiredScope).toBe('vertical:write')
  })

  it('accepts a callback_url from a key that holds write scope', async () => {
    const instance = await build(['vertical:read', 'vertical:write'])
    const res = await post(instance, { callback_url: 'https://hooks.acme.example/done' })
    expect(res.statusCode).toBe(202)
  })

  it('rejects a callback_url pointing inside the deployment, even with write scope', async () => {
    const instance = await build(['vertical:write'])
    const res = await post(instance, { callback_url: 'http://169.254.169.254/latest/meta-data/' })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('INVALID_CALLBACK_URL')
  })

  it('lets admin-secret traffic through, which carries no key scopes', async () => {
    const instance = await build(undefined)
    const res = await post(instance, { callback_url: 'https://hooks.acme.example/done' })
    expect(res.statusCode).toBe(202)
  })
})
