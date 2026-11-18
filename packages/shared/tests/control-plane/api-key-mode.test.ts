/**
 * The live/test key boundary, pinned across every surface that authenticates a
 * tenant Bearer key.
 *
 * The point of this file is the *breadth*, not any single case. `requireTenantKey`
 * guards four surfaces — `/v1/customers*`, `/v1/connections*`, `/v1/events`, and
 * (via `createUnifiedAuthMiddleware`) `/v1/{vertical}/*`. A mode check written
 * into the vertical middleware alone would leave the first three open to a
 * sandbox key. `resolveApiKey` defaults `expected` to `'live'` precisely so that
 * every one of them — and anything wired later — refuses a test key for free.
 *
 * Both directions are asserted: a test key must not reach live surfaces, and a
 * live key's behaviour on each surface is asserted too.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { ApiKeyStore } from '../../src/auth/api-keys'
import { ConnectSessionStore } from '../../src/auth/connect-sessions'
import { CredentialStore } from '../../src/auth/store'
import { EndUserStore } from '../../src/auth/end-users'
import { InboundEventStore } from '../../src/control-plane/inbound-event-store'
import { createCustomersRouter } from '../../src/control-plane/customers-router'
import { createConnectionsDevRouter } from '../../src/control-plane/connections-dev-router'
import { createInboundEventsRouter } from '../../src/control-plane/inbound-events-router'
import { createUnifiedAuthMiddleware } from '../../src/control-plane/auth-middleware'
import { resetRateLimitBuckets } from '../../src/control-plane/rate-limit'

const SECRET = 'api-key-mode-test-secret-must-be-32-chars-long'
const UUID = '11111111-2222-4333-8444-555555555555'

interface Harness {
  fastify: FastifyInstance
  apiKeys: ApiKeyStore
  handle: DbHandle
  liveKey: string
  testKey: string
}

async function setup(): Promise<Harness> {
  const handle = await openDb({ sqlitePath: ':memory:' })
  const apiKeys = await ApiKeyStore.create(handle, SECRET)
  const endUsers = await EndUserStore.create(handle, SECRET)
  const sessions = await ConnectSessionStore.create(handle)
  const credentials = await CredentialStore.create(handle, SECRET)
  const events = await InboundEventStore.create(handle)

  const fastify = Fastify({ logger: false })
  await fastify.register(createCustomersRouter({ apiKeys, endUsers, sessions, credentials }))
  await fastify.register(createConnectionsDevRouter({ apiKeys, credentials }))
  await fastify.register(createInboundEventsRouter({ apiKeys, events }))

  // The vertical surface, wired the way integration-server wires it. The
  // registry returns nothing, so a request that clears auth lands on
  // ADAPTER_UNAVAILABLE — which is exactly the signal we want: it proves the
  // request got *past* the key check rather than being refused by it.
  const registry = { get: () => null } as never
  await fastify.register(async (app) => {
    app.addHook(
      'preHandler',
      createUnifiedAuthMiddleware({ store: credentials, registry, apiKeys, sessions }),
    )
    app.get('/v1/accounting/invoices', async () => ({ data: [] }))
  })

  await fastify.ready()

  const live = await apiKeys.mint({ tenantId: 'acme', scopes: ['*'] })
  const test = await apiKeys.mint({ tenantId: 'acme', scopes: ['*'], mode: 'test' })
  return { fastify, apiKeys, handle, liveKey: live.plaintext, testKey: test.plaintext }
}

// Every surface guarded by a tenant Bearer key, with the status a *live* key
// gets today. None of these is a 401/403 from the key check itself.
const LIVE_SURFACES: Array<{ name: string; url: string; liveStatus: number[] }> = [
  { name: '/v1/customers', url: '/v1/customers', liveStatus: [200] },
  { name: '/v1/connections', url: '/v1/connections', liveStatus: [200] },
  { name: '/v1/events', url: '/v1/events', liveStatus: [200] },
  {
    name: '/v1/{vertical}/*',
    url: `/v1/accounting/invoices?connection_id=${UUID}`,
    // No connect-session links this connection to the tenant, so ownership
    // refuses first. Either way it is past the mode gate.
    liveStatus: [403, 404],
  },
]

describe('live/test key boundary', () => {
  let h: Harness

  beforeEach(async () => {
    resetRateLimitBuckets()
    h = await setup()
  })

  afterEach(async () => {
    await h.fastify.close()
    await h.handle.close()
  })

  describe.each(LIVE_SURFACES)('$name', (surface) => {
    it('refuses a test key with KEY_MODE_MISMATCH', async () => {
      const res = await h.fastify.inject({
        method: 'GET',
        url: surface.url,
        headers: { authorization: `Bearer ${h.testKey}` },
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('KEY_MODE_MISMATCH')
      // The message should point the caller at the surface their key is for.
      expect(res.json().error.message).toContain('/test/v1')
    })

    it('still accepts a live key (regression pin)', async () => {
      const res = await h.fastify.inject({
        method: 'GET',
        url: surface.url,
        headers: { authorization: `Bearer ${h.liveKey}` },
      })
      expect(surface.liveStatus).toContain(res.statusCode)
      if (res.statusCode === 403) {
        expect(res.json().error.code).not.toBe('KEY_MODE_MISMATCH')
      }
    })
  })

  it('refuses a test key on a write, not just a read', async () => {
    const res = await h.fastify.inject({
      method: 'POST',
      url: '/v1/customers',
      headers: { authorization: `Bearer ${h.testKey}` },
      payload: { email: 'someone@acme.example' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('KEY_MODE_MISMATCH')
  })

  it('still rejects an invalid key with 401, not a mode error', async () => {
    const res = await h.fastify.inject({
      method: 'GET',
      url: '/v1/customers',
      headers: { authorization: 'Bearer osk_acme_not-a-real-key' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('UNAUTHENTICATED')
  })

  it('refuses a revoked test key as unauthenticated, not as a mode mismatch', async () => {
    const key = await h.apiKeys.mint({ tenantId: 'acme', scopes: ['*'], mode: 'test' })
    const row = (await h.apiKeys.list('acme', { mode: 'test' })).find((r) => r.id === key.id)!
    await h.apiKeys.revoke(row.id)
    const res = await h.fastify.inject({
      method: 'GET',
      url: '/v1/customers',
      headers: { authorization: `Bearer ${key.plaintext}` },
    })
    expect(res.statusCode).toBe(401)
  })
})
