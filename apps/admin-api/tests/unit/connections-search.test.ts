/**
 * Searching connections by id or label.
 *
 * The operator-facing list had filters for vertical, status and platform but no
 * way to find one connection. That matters most for the connection id: it is
 * what every `/v1/*` call needs as `?connection_id=`, what support tickets
 * quote, and the one field an operator arrives already knowing — yet the only
 * way to locate it was to page through the list.
 *
 * Search runs here rather than in the browser because this route paginates:
 * `allConnections()` fetches everything, filters, then slices. Filtering client
 * side would only search the page in view, which reads as "no results" for a
 * connection that exists two pages down.
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
    createdAt: '2026-01-15T09:30:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
  },
  {
    id: 'aa11bb22-2222-4a2b-8c3d-000000000002',
    vertical: 'payments',
    platform: 'stripe',
    label: 'Acme Payments',
    status: 'valid',
    createdAt: '2026-01-16T09:30:00.000Z',
    updatedAt: '2026-02-02T10:00:00.000Z',
  },
  {
    id: 'bb22cc33-3333-4a2b-8c3d-000000000003',
    vertical: 'crm',
    platform: 'nutshell',
    label: null,
    status: 'expired',
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

async function list(query: string) {
  const token = app.jwt.sign({ id: 'u1', username: 'admin', role: 'admin' })
  const res = await app.inject({
    method: 'GET',
    url: `/api/connections${query}`,
    headers: { authorization: `Bearer ${token}` },
  })
  return { statusCode: res.statusCode, body: res.json() }
}

describe('GET /api/connections?search=', () => {
  it('returns everything when no search is given', async () => {
    const { body } = await list('')
    expect(body.data).toHaveLength(3)
  })

  it('finds a connection by its full id', async () => {
    const { body } = await list('?search=9f8e7d6c-1111-4a2b-8c3d-000000000001')
    expect(body.data.map((c: { platform: string }) => c.platform)).toEqual(['fortnox'])
  })

  it('finds a connection by an id prefix, which is what an operator pastes', async () => {
    const { body } = await list('?search=aa11bb22')
    expect(body.data.map((c: { platform: string }) => c.platform)).toEqual(['stripe'])
  })

  it('finds connections by label, case-insensitively', async () => {
    const { body } = await list('?search=acme')
    expect(body.data).toHaveLength(2)
  })

  it('matches a label substring, not just a prefix', async () => {
    const { body } = await list('?search=payments')
    expect(body.data.map((c: { platform: string }) => c.platform)).toEqual(['stripe'])
  })

  it('tolerates a connection with no label', async () => {
    const { body } = await list('?search=nutshell')
    // Matching on platform too would be a bonus; what matters is it does not throw.
    expect(body.statusCode).not.toBe(500)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('reports the searched total, so pagination reflects the search', async () => {
    const { body } = await list('?search=acme')
    expect(body.meta.total).toBe(2)
  })

  it('combines with the other filters', async () => {
    const { body } = await list('?search=acme&vertical=payments')
    expect(body.data.map((c: { platform: string }) => c.platform)).toEqual(['stripe'])
  })

  it('returns an empty page rather than an error when nothing matches', async () => {
    const { statusCode, body } = await list('?search=zzzz-no-such-thing')
    expect(statusCode).toBe(200)
    expect(body.data).toEqual([])
    expect(body.meta.total).toBe(0)
  })

  it('ignores surrounding whitespace', async () => {
    const { body } = await list('?search=%20acme%20')
    expect(body.data).toHaveLength(2)
  })
})
