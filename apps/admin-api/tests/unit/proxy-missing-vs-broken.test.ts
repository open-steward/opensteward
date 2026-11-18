/**
 * "That row is gone" and "I could not ask" must never render the same.
 *
 * If a read/delete method on UnifiedClient wrapped its upstream call in
 * `catch { return null }` / `catch { return false }`, the route above would
 * turn that one value into a 404 with a definite message — "Connection not
 * found", "API key not found.", "Webhook subscription not found." An
 * integration-server that is down, restarting, or rejecting a stale
 * X-Admin-Secret would tell the operator their row had been deleted, and they
 * would go looking for a deletion that never happened. Likewise an upstream
 * 415 on rotate-secret would surface only as "Failed to rotate secret", with
 * nothing naming a cause.
 *
 * The invariant: an upstream 404 keeps its 404 (the row really is missing),
 * and every other upstream failure keeps its own status and its own reason.
 *
 * The upstream below is a real Fastify server the real UnifiedClient talks to
 * over a socket, so what is asserted is the whole chain — client, route, error
 * handler — not a mock being called.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { AddressInfo } from 'net'
import jwt from '@fastify/jwt'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import { UnifiedClient } from '../../src/core/proxy/client'
import { Aggregator } from '../../src/core/proxy/aggregator'
import { createConnectionsRoutes } from '../../src/core/routes/connections'
import { createWebhookSubsRoutes } from '../../src/core/routes/webhook-subs'
import { createSyncJobsRoutes } from '../../src/core/routes/sync-jobs'
import { createApiKeysRoutes } from '../../src/core/routes/api-keys'
import { createEndUsersRoutes } from '../../src/core/routes/end-users'
import { createConnectSessionsRoutes } from '../../src/core/routes/connect-sessions'
import { createEndUserTokensRoutes } from '../../src/core/routes/end-user-tokens'
import type { AdminStore } from '../../src/core/db/admin-store'

/** What the stub integration-server answers next. */
type UpstreamMode = 'missing' | 'broken'
let mode: UpstreamMode = 'missing'

const BROKEN_REASON = 'integration-server is restarting.'

let upstream: FastifyInstance
let app: FastifyInstance
let client: UnifiedClient

beforeAll(async () => {
  upstream = Fastify({ logger: false })
  upstream.all('/*', async (_request, reply) => {
    if (mode === 'missing') {
      return reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: 'No row with that id.' } })
    }
    return reply
      .status(503)
      .send({ error: { code: 'UPSTREAM_UNAVAILABLE', message: BROKEN_REASON } })
  })
  await upstream.listen({ port: 0, host: '127.0.0.1' })
  const port = (upstream.server.address() as AddressInfo).port

  client = new UnifiedClient({ url: `http://127.0.0.1:${port}`, adminSecret: 'test-admin-secret' })
  const aggregator = new Aggregator(client, ['accounting'])
  const adminStore = { writeAudit: vi.fn() } as unknown as AdminStore

  app = Fastify({ logger: false })
  await registerOpenApiBridge(app)
  await app.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
  app.decorate('authenticate', requireAuth)
  app.decorate('operatorOnly', requireRole('operator'))
  app.decorate('adminOnly', requireRole('admin'))
  await app.register(createConnectionsRoutes(aggregator, adminStore))
  await app.register(createWebhookSubsRoutes(client, adminStore))
  await app.register(createSyncJobsRoutes(client, adminStore))
  await app.register(createApiKeysRoutes(client, adminStore))
  await app.register(createEndUsersRoutes(client, adminStore))
  await app.register(createConnectSessionsRoutes(client, adminStore))
  await app.register(createEndUserTokensRoutes(client, adminStore))
  await app.ready()
})

afterAll(async () => {
  await app?.close()
  await upstream?.close()
})

interface Case {
  method: 'GET' | 'POST' | 'DELETE'
  url: string
  payload?: Record<string, unknown>
}

/** Every admin-api endpoint whose route renders a swallowed proxy value as 404. */
const CASES: Case[] = [
  { method: 'GET', url: '/api/connections/accounting/conn-1' },
  { method: 'DELETE', url: '/api/connections/accounting/conn-1' },
  { method: 'GET', url: '/api/end-users/eu_1' },
  { method: 'GET', url: '/api/connect-sessions/cs_1' },
  { method: 'DELETE', url: '/api/api-keys/key_1' },
  { method: 'DELETE', url: '/api/end-user-tokens/eut_1' },
  { method: 'DELETE', url: '/api/webhook-subscriptions/sub_1' },
  { method: 'POST', url: '/api/webhook-subscriptions/sub_1/paused', payload: { paused: true } },
  { method: 'POST', url: '/api/webhook-subscriptions/sub_1/rotate-secret', payload: {} },
  {
    method: 'POST',
    url: '/api/webhook-subscriptions/sub_1/deliveries/del_1/replay',
    payload: {},
  },
  { method: 'GET', url: '/api/sync-jobs/job_1' },
  { method: 'POST', url: '/api/sync-jobs/job_1/cancel', payload: {} },
]

async function call(c: Case) {
  const token = app.jwt.sign({ id: 'u1', username: 'admin', role: 'admin' })
  const res = await app.inject({
    method: c.method,
    url: c.url,
    headers: { authorization: `Bearer ${token}` },
    ...(c.payload ? { payload: c.payload } : {}),
  })
  return { statusCode: res.statusCode, body: res.body ? res.json() : null }
}

describe('an upstream 404 still means "not found"', () => {
  it.each(CASES)('$method $url → 404', async (c) => {
    mode = 'missing'
    const { statusCode } = await call(c)
    expect(statusCode).toBe(404)
  })
})

describe('an upstream failure is not reported as "not found"', () => {
  it.each(CASES)('$method $url keeps the upstream status', async (c) => {
    mode = 'broken'
    const { statusCode } = await call(c)
    expect(statusCode).not.toBe(404)
    expect(statusCode).toBe(503)
  })

  it.each(CASES)('$method $url names the cause', async (c) => {
    mode = 'broken'
    const { body } = await call(c)
    expect(String(body?.error)).toContain(BROKEN_REASON)
  })
})

describe('UnifiedClient — an empty answer only ever means "no such row"', () => {
  it('returns null when the subscription really is gone', async () => {
    mode = 'missing'
    await expect(client.rotateWebhookSubSecret('sub_1')).resolves.toBeNull()
  })

  it('rejects when the rotate never got an answer', async () => {
    mode = 'broken'
    await expect(client.rotateWebhookSubSecret('sub_1')).rejects.toThrow()
  })

  it('returns false when the subscription to delete really is gone', async () => {
    mode = 'missing'
    await expect(client.deleteWebhookSub('sub_1')).resolves.toBe(false)
  })

  it('rejects rather than reporting false when the delete never landed', async () => {
    mode = 'broken'
    await expect(client.deleteWebhookSub('sub_1')).rejects.toThrow()
  })
})
