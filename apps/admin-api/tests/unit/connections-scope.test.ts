/**
 * Tenant scope on the connection and sync-job surfaces: a restricted caller
 * sees only its tenants' rows (counted after the filter), and an out-of-scope
 * id answers 404 exactly like an unknown one. Unrestricted callers are
 * unaffected.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { openDb } from '@opensteward/shared'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import { createAccessResolver, invalidateAccess } from '../../src/core/auth/access'
import { AdminStore } from '../../src/core/db/admin-store'
import { createConnectionsRoutes } from '../../src/core/routes/connections'
import { createSyncJobsRoutes } from '../../src/core/routes/sync-jobs'
import type { Aggregator } from '../../src/core/proxy/aggregator'
import type { UnifiedClient } from '../../src/core/proxy/client'

function conn(id: string, tenantId: string | null, vertical = 'accounting') {
  return {
    id,
    vertical,
    platform: 'fortnox',
    tenantId,
    label: id,
    status: 'valid',
    expiresAt: null,
    lastRefreshAt: null,
    lastRefreshStatus: 'ok' as const,
    createdAt: '2026-01-15T09:30:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
  }
}

const CONNECTIONS = [
  conn('c-acme-1', 'acme'),
  conn('c-acme-crm', 'acme', 'crm'),
  conn('c-globex', 'globex'),
  conn('c-none', null),
]

function job(id: string, tenantId: string, createdAt: string, vertical = 'accounting') {
  return {
    id,
    vertical,
    connectionId: `c-${id}`,
    platform: 'fortnox',
    tenantId,
    status: 'completed',
    createdAt,
  }
}

const JOBS = [
  job('j1', 'acme', '2026-01-01T00:00:00.000Z'),
  job('j2', 'globex', '2026-01-02T00:00:00.000Z'),
  job('j3', 'initech', '2026-01-03T00:00:00.000Z'),
  job('j4', 'acme', '2026-01-04T00:00:00.000Z', 'crm'),
]

let app: FastifyInstance
let store: AdminStore
const deleted: string[] = []

beforeEach(async () => {
  invalidateAccess()
  deleted.length = 0
  store = await AdminStore.create(await openDb({ sqlitePath: ':memory:' }))
  app = Fastify({ logger: false })
  await registerOpenApiBridge(app)
  await app.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
  app.decorate('authenticate', requireAuth)
  app.decorate('operatorOnly', requireRole('operator'))
  app.decorate('adminOnly', requireRole('admin'))
  app.decorate('accessResolver', createAccessResolver(store))

  const client = {
    getConnection: async (id: string) => CONNECTIONS.find((c) => c.id === id) ?? null,
    deleteConnection: async (id: string) => {
      deleted.push(id)
      return true
    },
    listSyncJobs: async (opts: { tenant_id?: string; limit?: number; offset?: number }) => {
      const rows = JOBS.filter((j) => !opts.tenant_id || j.tenantId === opts.tenant_id).sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt),
      )
      const offset = opts.offset ?? 0
      return { data: rows.slice(offset, offset + (opts.limit ?? 50)), total: rows.length }
    },
    getSyncJob: async (id: string) => JOBS.find((j) => j.id === id) ?? null,
  }
  const aggregator = {
    allConnections: async () => CONNECTIONS,
    knownVertical: () => true,
    getClient: () => client,
  } as unknown as Aggregator
  await app.register(createConnectionsRoutes(aggregator, store))
  await app.register(createSyncJobsRoutes(client as unknown as UnifiedClient, store))
  await app.ready()
})

afterEach(async () => {
  await app?.close()
  await store?.close()
})

async function tokenFor(scope: 'all' | Array<{ tenantId: string; verticals: '*' | string[] }>) {
  const user = await store.createUser(`u-${Math.random()}`, 'hash', 'operator')
  if (scope !== 'all')
    await store.setUserScope(user.id, { mode: 'restricted', grants: scope }, 'manual')
  return app.jwt.sign({ id: user.id, username: user.username, role: 'operator' })
}

async function get(token: string, url: string) {
  return app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } })
}

describe('connections', () => {
  it('an unrestricted caller sees every connection', async () => {
    const res = await get(await tokenFor('all'), '/api/connections')
    expect(res.json().meta.total).toBe(4)
  })

  it('a restricted caller sees only its tenants, counted after the filter', async () => {
    const res = await get(
      await tokenFor([{ tenantId: 'acme', verticals: '*' }]),
      '/api/connections',
    )
    expect(
      res
        .json()
        .data.map((c: { id: string }) => c.id)
        .sort(),
    ).toEqual(['c-acme-1', 'c-acme-crm'])
    expect(res.json().meta.total).toBe(2)
  })

  it('honours a vertical-limited grant', async () => {
    const res = await get(
      await tokenFor([{ tenantId: 'acme', verticals: ['crm'] }]),
      '/api/connections',
    )
    expect(res.json().data.map((c: { id: string }) => c.id)).toEqual(['c-acme-crm'])
  })

  it('answers 404 for an out-of-scope or untenanted connection', async () => {
    const token = await tokenFor([{ tenantId: 'acme', verticals: '*' }])
    expect((await get(token, '/api/connections/accounting/c-acme-1')).statusCode).toBe(200)
    expect((await get(token, '/api/connections/accounting/c-globex')).statusCode).toBe(404)
    expect((await get(token, '/api/connections/accounting/c-none')).statusCode).toBe(404)
    const del = await app.inject({
      method: 'DELETE',
      url: '/api/connections/accounting/c-globex',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(del.statusCode).toBe(404)
    expect(deleted).toEqual([])
  })

  it('a restricted caller with no grants sees nothing', async () => {
    const res = await get(await tokenFor([]), '/api/connections')
    expect(res.json()).toMatchObject({ data: [], meta: { total: 0 } })
  })
})

describe('sync jobs', () => {
  it('merges the granted tenants, newest first', async () => {
    const token = await tokenFor([
      { tenantId: 'acme', verticals: '*' },
      { tenantId: 'globex', verticals: '*' },
    ])
    const res = await get(token, '/api/sync-jobs')
    expect(res.json().data.map((j: { id: string }) => j.id)).toEqual(['j4', 'j2', 'j1'])
    expect(res.json().meta.total).toBe(3)
  })

  it('pins a single-tenant scope upstream and trims a vertical-limited grant', async () => {
    const token = await tokenFor([{ tenantId: 'acme', verticals: ['accounting'] }])
    const res = await get(token, '/api/sync-jobs')
    expect(res.json().data.map((j: { id: string }) => j.id)).toEqual(['j1'])
  })

  it('answers an out-of-scope tenant filter with an empty page', async () => {
    const token = await tokenFor([{ tenantId: 'acme', verticals: '*' }])
    const res = await get(token, '/api/sync-jobs?tenant_id=globex')
    expect(res.json()).toMatchObject({ data: [], meta: { total: 0 } })
  })

  it('answers 404 for an out-of-scope job', async () => {
    const token = await tokenFor([{ tenantId: 'acme', verticals: '*' }])
    expect((await get(token, '/api/sync-jobs/j1')).statusCode).toBe(200)
    expect((await get(token, '/api/sync-jobs/j2')).statusCode).toBe(404)
  })

  it('leaves an unrestricted caller on the upstream page', async () => {
    const res = await get(await tokenFor('all'), '/api/sync-jobs')
    expect(res.json().meta.total).toBe(4)
  })
})
