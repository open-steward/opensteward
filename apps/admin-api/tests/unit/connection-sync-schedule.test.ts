/**
 * Setting a connection's sync schedule through admin-api: validated, scoped
 * like a rename (the vertical in the path must match; out of scope reads as
 * absent), operator+, and audited with what changed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { openDb } from '@opensteward/shared'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { createConnectionsRoutes } from '../../src/core/routes/connections'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import {
  createAccessResolver,
  invalidateAccess,
  type AccessResolver,
} from '../../src/core/auth/access'
import type { Aggregator } from '../../src/core/proxy/aggregator'
import { AdminStore } from '../../src/core/db/admin-store'

const ROW = {
  id: '9f8e7d6c-1111-4a2b-8c3d-000000000001',
  vertical: 'accounting',
  platform: 'fortnox',
  tenantId: 'acme',
  label: 'Acme Books',
  status: 'valid',
  createdAt: '2026-01-15T09:30:00.000Z',
  updatedAt: '2026-02-01T10:00:00.000Z',
  syncMode: 'default',
  syncIntervalMinutes: null,
}

let app: FastifyInstance
let scopeStore: AdminStore | undefined
const getConnection = vi.fn()
const setConnectionSyncSchedule = vi.fn()
const writeAudit = vi.fn()

/**
 * No resolver (the default) means every caller is unrestricted. The scope test
 * passes the real one over an in-memory store, as `connections-scope.test.ts`
 * does; the audit stays the `writeAudit` spy either way.
 */
async function buildApp(accessResolver?: AccessResolver): Promise<FastifyInstance> {
  const instance = Fastify({ logger: false })
  await registerOpenApiBridge(instance)
  await instance.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
  instance.decorate('authenticate', requireAuth)
  instance.decorate('operatorOnly', requireRole('operator'))
  instance.decorate('adminOnly', requireRole('admin'))
  if (accessResolver) instance.decorate('accessResolver', accessResolver)
  const aggregator = {
    allConnections: async () => [ROW],
    knownVertical: (v: string) => ['accounting', 'payments'].includes(v),
    getClient: () => ({ getConnection, setConnectionSyncSchedule }),
  } as unknown as Aggregator
  await instance.register(
    createConnectionsRoutes(aggregator, { writeAudit } as unknown as AdminStore),
  )
  await instance.ready()
  return instance
}

beforeEach(async () => {
  getConnection.mockReset().mockResolvedValue(ROW)
  setConnectionSyncSchedule
    .mockReset()
    .mockImplementation(async (_id: string, s: { mode: string; intervalMinutes?: number }) => ({
      ...ROW,
      syncMode: s.mode,
      syncIntervalMinutes: s.intervalMinutes ?? null,
    }))
  writeAudit.mockReset()
  app = await buildApp()
})

afterEach(async () => {
  await app?.close()
  await scopeStore?.close()
  scopeStore = undefined
})

function put(body: unknown, opts: { role?: string; vertical?: string; token?: string } = {}) {
  const token =
    opts.token ?? app.jwt.sign({ id: 'u1', username: 'admin', role: opts.role ?? 'admin' })
  return app.inject({
    method: 'PUT',
    url: `/api/connections/${opts.vertical ?? 'accounting'}/${ROW.id}/sync-schedule`,
    headers: { authorization: `Bearer ${token}` },
    payload: body as never,
  })
}

describe('PUT /api/connections/:vertical/:id/sync-schedule', () => {
  it('sets a custom schedule and audits from and to', async () => {
    const res = await put({ mode: 'custom', intervalMinutes: 120 })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({ syncMode: 'custom', syncIntervalMinutes: 120 })
    expect(setConnectionSyncSchedule).toHaveBeenCalledWith(ROW.id, {
      mode: 'custom',
      intervalMinutes: 120,
    })
    expect(writeAudit).toHaveBeenCalledWith({
      userId: 'u1',
      action: 'connection.sync_schedule',
      vertical: 'accounting',
      targetId: ROW.id,
      detail: {
        from: { mode: 'default', intervalMinutes: null },
        to: { mode: 'custom', intervalMinutes: 120 },
      },
    })
  })

  it.each([
    [{ mode: 'custom' }],
    [{ mode: 'custom', intervalMinutes: 10 }],
    [{ mode: 'every-tuesday' }],
    [{ mode: 'once', intervalMinutes: 60 }],
  ])('refuses %j without touching the connection', async (body) => {
    const res = await put(body)
    expect(res.statusCode).toBe(400)
    expect(setConnectionSyncSchedule).not.toHaveBeenCalled()
  })

  it('404s when the path names another vertical', async () => {
    expect((await put({ mode: 'once' }, { vertical: 'payments' })).statusCode).toBe(404)
    expect(setConnectionSyncSchedule).not.toHaveBeenCalled()
  })

  it('404s when upstream no longer has the connection', async () => {
    setConnectionSyncSchedule.mockResolvedValue(null)
    expect((await put({ mode: 'once' })).statusCode).toBe(404)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("404s for a connection outside the caller's tenant scope", async () => {
    invalidateAccess()
    scopeStore = await AdminStore.create(await openDb({ sqlitePath: ':memory:' }))
    await app.close()
    app = await buildApp(createAccessResolver(scopeStore))
    const tokenFor = async (tenantId: string) => {
      const user = await scopeStore!.createUser(`op-${tenantId}`, 'hash', 'operator')
      await scopeStore!.setUserScope(
        user.id,
        { mode: 'restricted', grants: [{ tenantId, verticals: '*' }] },
        'manual',
      )
      return app.jwt.sign({ id: user.id, username: user.username, role: 'operator' })
    }

    const outside = await put({ mode: 'once' }, { token: await tokenFor('globex') })
    expect(outside.statusCode).toBe(404)
    expect(setConnectionSyncSchedule).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()

    // Control: the same harness with ROW's tenant granted goes through, so the
    // 404 above is the scope check and not a broken resolver.
    expect((await put({ mode: 'once' }, { token: await tokenFor('acme') })).statusCode).toBe(200)
    expect(setConnectionSyncSchedule).toHaveBeenCalledTimes(1)
  })

  it('audits an unrecognised stored mode as default', async () => {
    getConnection.mockResolvedValue({ ...ROW, syncMode: 'hourly-ish', syncIntervalMinutes: null })
    expect((await put({ mode: 'trigger_only' })).statusCode).toBe(200)
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          from: { mode: 'default', intervalMinutes: null },
          to: { mode: 'trigger_only', intervalMinutes: null },
        },
      }),
    )
  })

  it('refuses a viewer', async () => {
    expect((await put({ mode: 'once' }, { role: 'viewer' })).statusCode).toBe(403)
    expect(setConnectionSyncSchedule).not.toHaveBeenCalled()
  })
})
