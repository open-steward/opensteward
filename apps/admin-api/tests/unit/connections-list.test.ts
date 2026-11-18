/**
 * Listing connections with all possible refresh statuses.
 *
 * A connection whose last refresh was rejected by the platform must not take
 * the whole list down. `CredentialStore` persists four refresh states
 * (store.ts:104): 'ok' | 'failed' | 'expired' | 'platform_error' but the
 * admin-api response schema declared only three, so a single platform_error
 * row failed response validation and answered 500 for every row on the page.
 * `platform_error` is a real, reachable state — store.ts:517 queries for it
 * and the admin UI has a "Platform creds" pill for it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { createConnectionsRoutes } from '../../src/core/routes/connections'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import type { Aggregator } from '../../src/core/proxy/aggregator'
import type { AdminStore } from '../../src/core/db/admin-store'

/** Complete rows: the route serializes through the `Connection` Zod schema,
 *  which requires createdAt/updatedAt — a partial fixture 500s on the way out. */
const CONNECTIONS = [
  {
    id: '9f8e7d6c-1111-4a2b-8c3d-000000000001',
    vertical: 'accounting',
    platform: 'fortnox',
    label: 'Acme Books',
    status: 'valid',
    lastRefreshStatus: 'ok' as const,
    createdAt: '2026-01-15T09:30:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
  },
  {
    id: 'aa11bb22-2222-4a2b-8c3d-000000000002',
    vertical: 'payments',
    platform: 'stripe',
    label: 'Acme Payments',
    status: 'platform_error',
    lastRefreshStatus: 'platform_error' as const,
    createdAt: '2026-01-16T09:30:00.000Z',
    updatedAt: '2026-02-02T10:00:00.000Z',
  },
  {
    id: 'bb22cc33-3333-4a2b-8c3d-000000000003',
    vertical: 'crm',
    platform: 'nutshell',
    label: null,
    status: 'expired',
    lastRefreshStatus: 'expired' as const,
    createdAt: '2026-01-17T09:30:00.000Z',
    updatedAt: '2026-02-03T10:00:00.000Z',
  },
]

let app: FastifyInstance

beforeEach(async () => {
  app = Fastify({ logger: false })
  await registerOpenApiBridge(app)
  await app.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
  app.decorate('authenticate', requireAuth)
  app.decorate('operatorOnly', requireRole('operator'))
  app.decorate('adminOnly', requireRole('admin'))

  const aggregator = {
    allConnections: async () => CONNECTIONS,
  } as unknown as Aggregator
  await app.register(createConnectionsRoutes(aggregator, {} as AdminStore))
  await app.ready()
})

afterEach(async () => {
  await app?.close()
})

async function list() {
  const token = app.jwt.sign({ id: 'u1', username: 'admin', role: 'admin' })
  const res = await app.inject({
    method: 'GET',
    url: '/api/connections',
    headers: { authorization: `Bearer ${token}` },
  })
  return { statusCode: res.statusCode, body: res.json() }
}

describe('GET /api/connections', () => {
  it('lists connections when one has a platform_error refresh status', async () => {
    const { statusCode, body } = await list()
    expect(statusCode).toBe(200)
    expect(body.data).toHaveLength(3)
    // Find the connection with platform_error and verify it survives the response
    const platformErrorConn = body.data.find(
      (c: { lastRefreshStatus: string }) => c.lastRefreshStatus === 'platform_error',
    )
    expect(platformErrorConn).toBeDefined()
    expect(platformErrorConn.lastRefreshStatus).toBe('platform_error')
  })

  it('includes all valid refresh statuses in the response', async () => {
    const { statusCode, body } = await list()
    expect(statusCode).toBe(200)
    const statuses = body.data.map((c: { lastRefreshStatus: string }) => c.lastRefreshStatus)
    expect(statuses).toContain('ok')
    expect(statuses).toContain('platform_error')
    expect(statuses).toContain('expired')
  })
})
