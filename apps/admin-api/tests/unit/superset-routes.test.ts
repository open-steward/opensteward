/**
 * `/api/analytics/superset/*` and the internal registry PUT, against a mock
 * Superset: permission gating, the registry filtered by permission and
 * vertical scope, the guest token's RLS clause following the caller's scope,
 * 403 for an empty scope, the audit throttle, the disabled state, and the
 * service-secret-guarded registry sync.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { openDb, type DbHandle } from '@opensteward/shared'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import { createAccessResolver, invalidateAccess } from '../../src/core/auth/access'
import type { Permission } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'
import { SupersetDashboardStore } from '../../src/core/db/superset-dashboard-store'
import { SupersetClient } from '../../src/core/analytics/superset-client'
import { createSupersetRoutes, GUEST_TOKEN_AUDIT_INTERVAL_MS } from '../../src/core/routes/superset'
import { startMockSuperset, type MockSuperset } from './superset-mock'

const SERVICE_SECRET = 'service-secret-that-is-long-enough'
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

let app: FastifyInstance
let handle: DbHandle
let store: AdminStore
let registry: SupersetDashboardStore
let mock: MockSuperset
let clock = 1_000_000

async function build(enabled = true) {
  app = Fastify({ logger: false })
  await registerOpenApiBridge(app)
  await app.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
  app.decorate('authenticate', requireAuth)
  app.decorate('operatorOnly', requireRole('operator'))
  app.decorate('adminOnly', requireRole('admin'))
  app.decorate('accessResolver', createAccessResolver(store))
  await app.register(
    createSupersetRoutes({
      store: registry,
      adminStore: store,
      client: enabled
        ? new SupersetClient({ url: mock.url, username: 'svc', password: 'svc-password' })
        : null,
      publicUrl: enabled ? 'https://bi.example.test' : null,
      now: () => clock,
    }),
  )
  await app.ready()
}

beforeEach(async () => {
  invalidateAccess()
  vi.stubEnv('SERVICE_SECRET', SERVICE_SECRET)
  mock = await startMockSuperset()
  handle = await openDb({ sqlitePath: ':memory:' })
  store = await AdminStore.create(handle)
  registry = await SupersetDashboardStore.create(handle)
  await registry.upsertMany([
    {
      title: 'Overview',
      description: 'All connections',
      supersetUuid: UUID(1),
      embeddedUuid: UUID(11),
      verticals: null,
      requiredPermission: null,
    },
    {
      title: 'Payments',
      description: null,
      supersetUuid: UUID(2),
      embeddedUuid: UUID(12),
      verticals: ['payments'],
      requiredPermission: null,
    },
    {
      title: 'Raw data',
      description: null,
      supersetUuid: UUID(3),
      embeddedUuid: UUID(13),
      verticals: null,
      requiredPermission: 'data:read',
    },
  ])
  await store.createTenant('acme', 'Acme')
  await store.createTenant('globex', 'Globex')
  await build()
})

afterEach(async () => {
  await app?.close()
  await store?.close()
  await mock?.close()
})

async function tokenFor(
  role: 'viewer' | 'operator' | 'admin',
  scope: 'all' | Array<{ tenantId: string; verticals: '*' | string[] }> = 'all',
) {
  const user = await store.createUser(`u-${Math.random()}`, 'hash', role)
  if (scope !== 'all') {
    await store.setUserScope(user.id, { mode: 'restricted', grants: scope }, 'manual')
  }
  return { id: user.id, token: app.jwt.sign({ id: user.id, username: user.username, role }) }
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` })

async function idOf(title: string) {
  return (await registry.list()).find((d) => d.title === title)!.id
}

async function mint(token: string, dashboardId: string) {
  return app.inject({
    method: 'POST',
    url: '/api/analytics/superset/guest-token',
    headers: auth(token),
    payload: { dashboardId },
  })
}

async function auditRows() {
  return (await store.listAudit(100, 0)).filter((r) => r.action.startsWith('superset.'))
}

describe('status and listing', () => {
  it('requires a signed-in user', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/analytics/superset/status' })
    expect(res.statusCode).toBe(401)
  })

  it('reports enabled with the public URL', async () => {
    const { token } = await tokenFor('viewer')
    const res = await app.inject({
      method: 'GET',
      url: '/api/analytics/superset/status',
      headers: auth(token),
    })
    expect(res.json().data).toEqual({ enabled: true, publicUrl: 'https://bi.example.test' })
  })

  it('lists dashboards filtered by extra permission', async () => {
    const viewer = await tokenFor('viewer')
    const operator = await tokenFor('operator')
    const list = async (t: string) =>
      (
        await app.inject({
          method: 'GET',
          url: '/api/analytics/superset/dashboards',
          headers: auth(t),
        })
      )
        .json()
        .data.map((d: { title: string }) => d.title)
    expect(await list(viewer.token)).toEqual(['Overview', 'Payments'])
    expect(await list(operator.token)).toEqual(['Overview', 'Payments', 'Raw data'])
  })

  it('hides dashboards about verticals outside a restricted scope', async () => {
    const crmOnly = await tokenFor('viewer', [{ tenantId: 'acme', verticals: ['crm'] }])
    const res = await app.inject({
      method: 'GET',
      url: '/api/analytics/superset/dashboards',
      headers: auth(crmOnly.token),
    })
    expect(res.json().data.map((d: { title: string }) => d.title)).toEqual(['Overview'])
  })
})

describe('guest tokens', () => {
  it('mints an unrestricted token for an all-tenant user', async () => {
    const { token } = await tokenFor('viewer')
    const res = await mint(token, await idOf('Overview'))
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.json().data).toMatchObject({
      embeddedUuid: UUID(11),
      supersetDomain: 'https://bi.example.test',
      restricted: false,
    })
    expect(mock.guestTokenRequests[0]).toMatchObject({
      resources: [{ type: 'dashboard', id: UUID(11) }],
      rls: [],
    })
  })

  it('carries the scope as an RLS clause for a restricted user', async () => {
    const { token } = await tokenFor('viewer', [
      { tenantId: 'acme', verticals: '*' },
      { tenantId: 'beta', verticals: ['payments'] },
    ])
    const res = await mint(token, await idOf('Payments'))
    expect(res.statusCode).toBe(200)
    expect(res.json().data.restricted).toBe(true)
    expect(mock.guestTokenRequests[0]!['rls']).toEqual([
      {
        clause:
          "(owner_tenant_id IN ('acme') OR (owner_tenant_id = 'beta' AND vertical IN ('payments')))",
      },
    ])
  })

  it('refuses a user whose scope is empty', async () => {
    const { id, token } = await tokenFor('viewer', [{ tenantId: 'acme', verticals: '*' }])
    await store.setUserScope(id, { mode: 'restricted', grants: [] }, 'manual')
    invalidateAccess()
    const res = await mint(token, await idOf('Overview'))
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('SCOPE_EMPTY')
    expect(mock.guestTokenRequests).toHaveLength(0)
  })

  it('403s when every grant is unusable in SQL', async () => {
    const { token } = await tokenFor('viewer', [{ tenantId: "x') OR 1=1 --", verticals: '*' }])
    const res = await mint(token, await idOf('Overview'))
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('SCOPE_EMPTY')
    expect(mock.guestTokenRequests).toHaveLength(0)
  })

  it('404s a dashboard needing a permission the caller lacks, or an unknown id', async () => {
    const { token } = await tokenFor('viewer')
    expect((await mint(token, await idOf('Raw data'))).statusCode).toBe(404)
    expect((await mint(token, 'ssd_nope')).statusCode).toBe(404)
  })

  it('answers 502 when Superset refuses', async () => {
    const { token } = await tokenFor('viewer')
    mock.failGuestTokens(500)
    const res = await mint(token, await idOf('Overview'))
    expect(res.statusCode).toBe(502)
    expect(res.json().error.code).toBe('SUPERSET_UNAVAILABLE')
  })

  it('audits at most once per user and dashboard every 10 minutes', async () => {
    const a = await tokenFor('viewer')
    const b = await tokenFor('viewer')
    const overview = await idOf('Overview')
    const payments = await idOf('Payments')
    await mint(a.token, overview)
    await mint(a.token, overview)
    await mint(a.token, payments)
    await mint(b.token, overview)
    expect(await auditRows()).toHaveLength(3)
    clock += GUEST_TOKEN_AUDIT_INTERVAL_MS
    await mint(a.token, overview)
    const rows = await auditRows()
    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.action === 'superset.guest_token')).toBe(true)
  })
})

describe('disabled', () => {
  it('reports disabled and refuses the other routes with 409', async () => {
    await app.close()
    await build(false)
    const { token } = await tokenFor('viewer')
    const status = await app.inject({
      method: 'GET',
      url: '/api/analytics/superset/status',
      headers: auth(token),
    })
    expect(status.json().data).toEqual({ enabled: false, publicUrl: null })
    const list = await app.inject({
      method: 'GET',
      url: '/api/analytics/superset/dashboards',
      headers: auth(token),
    })
    expect(list.statusCode).toBe(409)
    expect(list.json().error.code).toBe('SUPERSET_DISABLED')
    expect((await mint(token, await idOf('Overview'))).statusCode).toBe(409)
  })
})

describe('internal registry sync', () => {
  const body = {
    dashboards: [
      {
        supersetUuid: UUID(1),
        embeddedUuid: UUID(21),
        title: 'Overview v2',
        verticals: [],
      },
      {
        supersetUuid: UUID(4),
        embeddedUuid: UUID(14),
        title: 'New',
        requiredPermission: 'data:read',
      },
    ],
    prune: true,
  }

  it('refuses without the service secret', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/internal/superset/dashboards',
      payload: body,
    })
    expect(res.statusCode).toBe(401)
    const { token } = await tokenFor('admin')
    const jwtOnly = await app.inject({
      method: 'PUT',
      url: '/api/internal/superset/dashboards',
      headers: auth(token),
      payload: body,
    })
    expect(jwtOnly.statusCode).toBe(401)
  })

  it('upserts by Superset uuid, keeps ids stable, prunes and audits', async () => {
    const overviewId = await idOf('Overview')
    const res = await app.inject({
      method: 'PUT',
      url: '/api/internal/superset/dashboards',
      headers: { 'x-service-secret': SERVICE_SECRET },
      payload: body,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({ created: 1, updated: 1, removed: 2 })
    const all = await registry.list()
    expect(all.map((d) => d.title)).toEqual(['New', 'Overview v2'])
    const overview = all.find((d) => d.title === 'Overview v2')!
    expect(overview.id).toBe(overviewId)
    expect(overview.embeddedUuid).toBe(UUID(21))
    expect(overview.verticals).toBeNull()
    expect((await auditRows())[0]).toMatchObject({ action: 'superset.registry_sync' })
  })

  it('rejects a malformed body', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/internal/superset/dashboards',
      headers: { 'x-service-secret': SERVICE_SECRET },
      payload: { dashboards: [{ supersetUuid: 'nope', embeddedUuid: UUID(1), title: 'x' }] },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('sharing', () => {
  function call(
    method: 'GET' | 'PATCH',
    url: string,
    token: string,
    payload?: Record<string, unknown>,
  ) {
    return app.inject({
      method,
      url,
      headers: auth(token),
      ...(payload !== undefined ? { payload } : {}),
    })
  }

  async function registerOne() {
    await registry.upsertMany([
      {
        supersetUuid: '11111111-1111-4111-8111-111111111111',
        embeddedUuid: '22222222-2222-4222-8222-222222222222',
        title: 'Audience test',
        description: null,
        verticals: null,
        requiredPermission: null,
      },
    ])
    return (await registry.list()).find((d) => d.title === 'Audience test')!
  }

  it('defaults to everyone and keeps sharing across a bootstrap re-sync', async () => {
    const d = await registerOne()
    expect(d).toMatchObject({ audience: { kind: 'everyone' }, pinnedTenants: null })
    await registry.setSharing(d.id, { kind: 'tenants', tenants: ['acme'] }, ['acme'])
    await registerOne() // bootstrap upsert again
    expect((await registry.get(d.id))!).toMatchObject({
      audience: { kind: 'tenants', tenants: ['acme'] },
      pinnedTenants: ['acme'],
    })
  })

  it('lists and mints only for the audience; pins narrow the RLS clause', async () => {
    const d = await registerOne()
    await registry.setSharing(d.id, { kind: 'tenants', tenants: ['acme'] }, ['acme'])
    const globex = await tokenFor('viewer', [{ tenantId: 'globex', verticals: '*' }])
    const list = await call('GET', '/api/analytics/superset/dashboards', globex.token)
    expect(list.json().data.map((x: { id: string }) => x.id)).not.toContain(d.id)
    const denied = await mint(globex.token, d.id)
    expect(denied.statusCode).toBe(404)
    const admin = await tokenFor('admin')
    const ok = await mint(admin.token, d.id)
    expect(ok.statusCode).toBe(200)
    expect(mock.guestTokenRequests.at(-1)!['rls']).toEqual([
      { clause: "owner_tenant_id IN ('acme')" },
    ])
  })

  it('PATCH needs dashboards:share_all, refuses private, audits superset.share', async () => {
    const d = await registerOne()
    const op = await tokenFor('operator')
    const body = { audience: { kind: 'tenants', tenants: ['acme'] }, pinnedTenants: null }
    expect(
      (await call('PATCH', `/api/analytics/superset/dashboards/${d.id}`, op.token, body))
        .statusCode,
    ).toBe(403)
    const admin = await tokenFor('admin')
    expect(
      (
        await call('PATCH', `/api/analytics/superset/dashboards/${d.id}`, admin.token, {
          audience: { kind: 'private' },
        })
      ).statusCode,
    ).toBe(400)
    const res = await call('PATCH', `/api/analytics/superset/dashboards/${d.id}`, admin.token, body)
    expect(res.statusCode).toBe(200)
    expect(res.json().data.audience).toEqual({ kind: 'tenants', tenants: ['acme'] })
    const rows = (await auditRows()).filter((r) => r.action === 'superset.share')
    expect(JSON.parse(rows[0]!.detail ?? '{}')).toMatchObject({
      title: 'Audience test',
      from: { kind: 'everyone' },
      to: { kind: 'tenants', tenants: ['acme'] },
    })
  })
})

describe('sharing: share_all needs an unrestricted scope', () => {
  async function sharer(
    scope?: Array<{ tenantId: string; verticals: '*' | string[] }>,
    permissions: Permission[] = ['dashboards:view', 'dashboards:share_all'],
  ) {
    const user = await store.createUser(`u-${Math.random()}`, 'hash', 'operator')
    const role = await store.createRole({
      name: `r-${Math.random()}`,
      baseRole: 'operator',
      permissions,
      createdBy: null,
    })
    await store.assignUserRole(user.id, role.id)
    if (scope) await store.setUserScope(user.id, { mode: 'restricted', grants: scope }, 'manual')
    invalidateAccess()
    return {
      id: user.id,
      token: app.jwt.sign({ id: user.id, username: user.username, role: 'operator' }),
    }
  }
  const patch = (id: string, token: string, payload: Record<string, unknown>) =>
    app.inject({
      method: 'PATCH',
      url: `/api/analytics/superset/dashboards/${id}`,
      headers: auth(token),
      payload,
    })
  async function registerOne() {
    await registry.upsertMany([
      {
        supersetUuid: '33333333-3333-4333-8333-333333333333',
        embeddedUuid: '44444444-4444-4444-8444-444444444444',
        title: 'Restricted test',
        description: null,
        verticals: null,
        requiredPermission: null,
      },
    ])
    return (await registry.list()).find((d) => d.title === 'Restricted test')!
  }

  it('a tenant-restricted share_all holder gets 403 on PATCH and redacted tenants in the list', async () => {
    const d = await registerOne()
    await registry.setSharing(d.id, { kind: 'tenants', tenants: ['acme', 'globex'] }, [
      'acme',
      'globex',
    ])
    const r = await sharer([{ tenantId: 'acme', verticals: '*' }])
    expect((await patch(d.id, r.token, { audience: { kind: 'everyone' } })).statusCode).toBe(403)
    expect(
      (await patch(d.id, r.token, { audience: { kind: 'tenants', tenants: ['initech'] } }))
        .statusCode,
    ).toBe(403)
    const list = await app.inject({
      method: 'GET',
      url: '/api/analytics/superset/dashboards',
      headers: auth(r.token),
    })
    const seen = list.json().data.find((x: { id: string }) => x.id === d.id)
    expect(seen.audience).toEqual({ kind: 'tenants', tenants: ['acme'] })
    expect(seen.pinnedTenants).toEqual(['acme'])
  })

  it('an unrestricted holder gets the full lists; a no-op PATCH neither writes nor bumps updated_at', async () => {
    const d = await registerOne()
    await registry.setSharing(d.id, { kind: 'tenants', tenants: ['acme', 'globex'] }, null)
    const before = (await registry.get(d.id))!.updatedAt
    clock += 5
    await new Promise((r) => setTimeout(r, 5))
    const admin = await tokenFor('admin')
    const res = await patch(d.id, admin.token, {
      audience: { kind: 'tenants', tenants: ['globex', 'acme'] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.audience.tenants).toEqual(['acme', 'globex'])
    expect((await registry.get(d.id))!.updatedAt).toBe(before)
    expect((await auditRows()).filter((r) => r.action === 'superset.share')).toHaveLength(0)
  })

  it('PATCH is 404 for a dashboard the caller cannot open', async () => {
    const d = await registerOne()
    await registry.upsertMany([
      {
        supersetUuid: '33333333-3333-4333-8333-333333333333',
        embeddedUuid: '44444444-4444-4444-8444-444444444444',
        title: 'Restricted test',
        description: null,
        verticals: null,
        requiredPermission: 'data:read',
      },
    ])
    const r = await sharer(undefined, ['dashboards:view', 'dashboards:share_all'])
    expect((await patch(d.id, r.token, { audience: { kind: 'everyone' } })).statusCode).toBe(404)
  })
})
