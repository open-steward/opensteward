/**
 * Admins always see every tenant; restricted users are refused on
 * instance-wide surfaces; role gates read the current role, not the token.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildAdminApiTestServer,
  createUserAndLogin,
  setupAdmin,
  type AdminApiTestServer,
} from '../journeys/helpers'
import { createAccessResolver, invalidateAccess } from '../../src/core/auth/access'

let server: AdminApiTestServer
let adminToken: string

beforeEach(async () => {
  invalidateAccess()
  server = await buildAdminApiTestServer()
  adminToken = await setupAdmin(server)
  await server.adminStore.createTenant('acme', 'Acme')
  await server.adminStore.createTenant('globex', 'Globex')
})

afterEach(async () => {
  await server?.cleanup()
})

function call(
  token: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
) {
  return server.fastify.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  })
}

async function idOf(username: string) {
  return (await server.adminStore.getUserByUsername(username))!.id
}

const ACME_ONLY = { mode: 'restricted' as const, grants: [{ tenantId: 'acme', verticals: '*' as const }] }

/** A restricted scope written behind the store's back, as a pre-rule database would hold. */
async function forceStaleRestriction(userId: string) {
  const kysely = (server.adminStore as any).handle.kysely
  await kysely.updateTable('users').set({ scope_mode: 'restricted' }).where('id', '=', userId).execute()
  await kysely.insertInto('user_scopes').values({ user_id: userId, tenant_id: 'acme', vertical: '*' }).execute()
  invalidateAccess()
}

describe('the resolver', () => {
  it('ignores a stored restriction on an admin', async () => {
    await createUserAndLogin(server, adminToken, 'ada', 'admin')
    const id = await idOf('ada')
    // A row written before this change, or by hand.
    await forceStaleRestriction(id)
    const access = await createAccessResolver(server.adminStore)(id)
    expect(access.baseRole).toBe('admin')
    expect(access.scope).toEqual({ mode: 'all' })
  })
})

describe('promotion clears the stored scope', () => {
  it('setUserRole(admin)', async () => {
    await createUserAndLogin(server, adminToken, 'op', 'operator')
    const id = await idOf('op')
    await server.adminStore.setUserScope(id, ACME_ONLY, 'manual')
    await server.adminStore.setUserRole(id, 'admin')
    expect(await server.adminStore.getUserScope(id)).toMatchObject({ mode: 'all', grants: [] })
    // Demoting again does not resurrect Acme-only.
    await server.adminStore.setUserRole(id, 'operator')
    expect(await server.adminStore.getUserScope(id)).toMatchObject({ mode: 'all', grants: [] })
  })

  it('assignUserRole(custom admin-based role)', async () => {
    const role = await server.adminStore.createRole({
      name: 'Super',
      description: null,
      baseRole: 'admin',
      permissions: ['connections:read'],
      createdBy: null,
    })
    await createUserAndLogin(server, adminToken, 'op', 'operator')
    const id = await idOf('op')
    await server.adminStore.setUserScope(id, ACME_ONLY, 'manual')
    await server.adminStore.assignUserRole(id, role.id)
    expect(await server.adminStore.getUserScope(id)).toMatchObject({ mode: 'all', grants: [] })
  })

  it('updateRole(baseRole: admin) clears every holder; countRestrictedHolders counts them first', async () => {
    const role = await server.adminStore.createRole({
      name: 'Tenant admin',
      description: null,
      baseRole: 'operator',
      permissions: ['users:manage'],
      createdBy: null,
    })
    await createUserAndLogin(server, adminToken, 'ta', 'operator')
    const id = await idOf('ta')
    await server.adminStore.assignUserRole(id, role.id)
    await server.adminStore.setUserScope(id, ACME_ONLY, 'manual')
    expect(await server.adminStore.countRestrictedHolders(role.id)).toBe(1)
    await server.adminStore.updateRole(role.id, { baseRole: 'admin' }, null)
    expect(await server.adminStore.getUserScope(id)).toMatchObject({ mode: 'all', grants: [] })
    expect(await server.adminStore.countRestrictedHolders(role.id)).toBe(0)
  })
})

it('the break-glass admin exists and is unrestricted (last-admin guarantee)', async () => {
  const setupId = await idOf('admin')
  await forceStaleRestriction(setupId) // a stale restricted row must not narrow the admin
  const access = await createAccessResolver(server.adminStore)(setupId)
  expect(access.baseRole).toBe('admin')
  expect(access.scope).toEqual({ mode: 'all' })
})

describe('role gates read the current role, not the token', () => {
  it('a demoted admin loses adminOnly routes without signing in again', async () => {
    const token = await createUserAndLogin(server, adminToken, 'ada', 'admin')
    const id = await idOf('ada')
    expect((await call(token, 'GET', '/api/schema-status')).statusCode).toBe(200)
    await server.adminStore.setUserRole(id, 'operator') // invalidates the access cache
    expect((await call(token, 'GET', '/api/schema-status')).statusCode).toBe(403)
  })

  it('a promoted operator gets adminOnly routes at once', async () => {
    const token = await createUserAndLogin(server, adminToken, 'op', 'operator')
    expect((await call(token, 'GET', '/api/schema-status')).statusCode).toBe(403)
    await server.adminStore.setUserRole(await idOf('op'), 'admin')
    expect((await call(token, 'GET', '/api/schema-status')).statusCode).toBe(200)
  })

  it('a promoted Acme-only user sees every tenant on the next request', async () => {
    const token = await createUserAndLogin(server, adminToken, 'op', 'operator')
    const id = await idOf('op')
    await call(adminToken, 'PUT', `/api/users/${id}/scope`, ACME_ONLY)
    expect((await call(token, 'GET', '/api/auth/me')).json().user.scope.mode).toBe('restricted')
    await call(adminToken, 'PUT', `/api/users/${id}/role`, { roleId: 'admin' })
    expect((await call(token, 'GET', '/api/auth/me')).json().user.scope.mode).toBe('all')
  })

  it('a deleted admin’s token is refused on adminOnly routes by the role gate itself', async () => {
    // A second admin, so the break-glass floor allows the delete.
    const token = await createUserAndLogin(server, adminToken, 'ada2', 'admin')
    expect((await call(token, 'GET', '/api/schema-status')).statusCode).toBe(200)
    await server.adminStore.deleteUser(await idOf('ada2'))
    invalidateAccess()
    const res = await call(token, 'GET', '/api/schema-status')
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('Forbidden — insufficient role')
  })

  it('a demoted admin cannot reveal end-user PII with a token that still says admin', async () => {
    const token = await createUserAndLogin(server, adminToken, 'ada', 'admin')
    await server.adminStore.setUserRole(await idOf('ada'), 'operator')
    const res = await call(token, 'GET', '/api/end-users/eu_1?include_pii=true')
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('Admin role required to reveal PII.')
  })

  it('a demoted admin cannot clear a platform:creds dismissal', async () => {
    const token = await createUserAndLogin(server, adminToken, 'ada', 'admin')
    await server.adminStore.setUserRole(await idOf('ada'), 'operator')
    const res = await call(token, 'POST', '/api/dashboard-tasks/dismissals', {
      items: [{ key: 'platform:creds:accounting/xero', fingerprint: 'fp' }],
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toContain('needs the admin role')
  })

  it('/api/auth/me reports the current role, not the token’s', async () => {
    const token = await createUserAndLogin(server, adminToken, 'op', 'operator')
    await server.adminStore.setUserRole(await idOf('op'), 'admin')
    expect((await call(token, 'GET', '/api/auth/me')).json().user.role).toBe('admin')
  })
})

describe('instance-wide surfaces', () => {
  async function acmeOperator() {
    const token = await createUserAndLogin(server, adminToken, 'acme-op', 'operator')
    await call(adminToken, 'PUT', `/api/users/${await idOf('acme-op')}/scope`, ACME_ONLY)
    return token
  }

  it('a restricted operator cannot change or disable a platform for every tenant', async () => {
    const token = await acmeOperator()
    for (const [method, url, body] of [
      ['PUT', '/api/verticals/accounting/platforms/xero/config', { config: {} }],
      ['POST', '/api/verticals/accounting/platforms/xero/disable', {}],
      ['POST', '/api/verticals/accounting/platforms/xero/enable', {}],
      ['GET', '/api/verticals/accounting/platforms/xero/config', undefined],
    ] as const) {
      const res = await call(token, method, url, body)
      expect(res.statusCode, `${method} ${url}`).toBe(403)
      expect(res.json().error.code).toBe('SCOPE_RESTRICTED')
    }
  })

  it('a restricted operator cannot edit OAuth scope groups', async () => {
    const token = await acmeOperator()
    const res = await call(token, 'POST', '/api/scope-groups', {
      vertical: 'accounting',
      platform: 'xero',
      name: 'x',
      scopes: ['a'],
    })
    expect(res.statusCode).toBe(403)
  })

  it('a restricted role manager can read roles but not change them', async () => {
    const created = await call(adminToken, 'POST', '/api/roles', {
      name: 'Tenant admin',
      baseRole: 'operator',
      permissions: ['connections:read', 'dashboards:view', 'roles:manage', 'users:manage'],
    })
    const roleId = created.json().data.id as string
    const token = await createUserAndLogin(server, adminToken, 'ta', 'operator')
    const id = await idOf('ta')
    await call(adminToken, 'PUT', `/api/users/${id}/role`, { roleId })
    await call(adminToken, 'PUT', `/api/users/${id}/scope`, ACME_ONLY)
    expect((await call(token, 'GET', '/api/roles')).statusCode).toBe(200)
    expect((await call(token, 'PATCH', `/api/roles/${roleId}`, { description: 'x' })).statusCode).toBe(403)
    expect(
      (await call(token, 'POST', '/api/roles', { name: 'Y', baseRole: 'viewer', permissions: [] })).statusCode,
    ).toBe(403)
  })

  it('the bell shows a restricted user nothing, never another tenant’s connection', async () => {
    await server.adminStore.createNotification('sync_failed', 'Globex Xero failed', 'accounting', 'conn_globex', 'xero')
    const viewer = await createUserAndLogin(server, adminToken, 'acme-v', 'viewer')
    await call(adminToken, 'PUT', `/api/users/${await idOf('acme-v')}/scope`, ACME_ONLY)
    const list = await call(viewer, 'GET', '/api/notifications')
    expect(list.statusCode).toBe(200)
    expect(list.json().data).toEqual([])
    expect((await call(viewer, 'GET', '/api/notifications/unread-count')).json().data.count).toBe(0)
    expect((await call(adminToken, 'GET', '/api/notifications')).json().data).toHaveLength(1)
    const acmeOp = await acmeOperator()
    expect((await call(acmeOp, 'POST', '/api/notifications/acknowledge-all')).statusCode).toBe(403)
  })

  it('a restricted operator cannot clear deployment-wide dashboard tasks', async () => {
    const token = await acmeOperator()
    expect((await call(token, 'DELETE', '/api/dashboard-tasks/dismissals/sync:failed:x')).statusCode).toBe(403)
  })
})

describe('write paths', () => {
  it('refuses to restrict an admin; mode all is fine', async () => {
    await createUserAndLogin(server, adminToken, 'ada', 'admin')
    const id = await idOf('ada')
    const res = await call(adminToken, 'PUT', `/api/users/${id}/scope`, ACME_ONLY)
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe(
      'Admins always have every tenant. Give this user a non-admin role before restricting them.',
    )
    expect((await call(adminToken, 'PUT', `/api/users/${id}/scope`, { mode: 'all' })).statusCode).toBe(200)
  })

  it('promoting a restricted user clears the scope and audits scopeCleared', async () => {
    await createUserAndLogin(server, adminToken, 'op', 'operator')
    const id = await idOf('op')
    await call(adminToken, 'PUT', `/api/users/${id}/scope`, ACME_ONLY)
    const res = await call(adminToken, 'PUT', `/api/users/${id}/role`, { roleId: 'admin' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.scopeMode).toBe('all')
    const [entry] = await server.adminStore.listAudit(1, 0, { action: 'user.role_assign', targetId: id })
    expect(JSON.parse(entry!.detail!)).toMatchObject({ roleId: 'admin', baseRole: 'admin', scopeCleared: true })
  })

  it('PATCH /api/users/:id to admin audits scopeCleared too', async () => {
    await createUserAndLogin(server, adminToken, 'op', 'operator')
    const id = await idOf('op')
    await call(adminToken, 'PUT', `/api/users/${id}/scope`, ACME_ONLY)
    expect((await call(adminToken, 'PATCH', `/api/users/${id}`, { role: 'admin' })).statusCode).toBe(200)
    const [entry] = await server.adminStore.listAudit(1, 0, { action: 'user.update', targetId: id })
    expect(JSON.parse(entry!.detail!)).toMatchObject({ role: 'admin', scopeCleared: true })
  })

  it('refuses to make a custom role admin-based while holders are restricted', async () => {
    const created = await call(adminToken, 'POST', '/api/roles', {
      name: 'Tenant admin',
      baseRole: 'operator',
      permissions: ['connections:read', 'users:manage'],
    })
    const roleId = created.json().data.id as string
    await createUserAndLogin(server, adminToken, 'ta', 'operator')
    const id = await idOf('ta')
    await call(adminToken, 'PUT', `/api/users/${id}/role`, { roleId })
    await call(adminToken, 'PUT', `/api/users/${id}/scope`, ACME_ONLY)
    const res = await call(adminToken, 'PATCH', `/api/roles/${roleId}`, { baseRole: 'admin' })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe(
      '1 user(s) with this role are limited to specific tenants, and admins always have every tenant. Give them every tenant first, or use a different role.',
    )
  })

  it('user views report the effective scope for an admin with a stale row', async () => {
    await createUserAndLogin(server, adminToken, 'ada', 'admin')
    const id = await idOf('ada')
    await forceStaleRestriction(id) // stale row
    const list = (await call(adminToken, 'GET', '/api/users')).json().data as Array<{
      id: string
      scopeMode: string
    }>
    expect(list.find((u) => u.id === id)!.scopeMode).toBe('all')
    const one = (await call(adminToken, 'GET', `/api/users/${id}`)).json().data
    expect(one.scope).toEqual({ mode: 'all', grants: [] })
  })
})

describe('review fixes', () => {
  it('the store refuses to restrict an admin', async () => {
    await createUserAndLogin(server, adminToken, 'ada', 'admin')
    const id = await idOf('ada')
    await expect(server.adminStore.setUserScope(id, ACME_ONLY, 'manual')).rejects.toThrow(
      /Admins always have every tenant/,
    )
    // mode all is fine
    await server.adminStore.setUserScope(id, { mode: 'all', grants: [] }, 'manual')
  })

  it('a custom role whose role_id points nowhere holds nothing, even on an admin base', async () => {
    await createUserAndLogin(server, adminToken, 'ghost', 'admin')
    const id = await idOf('ghost')
    await (server.adminStore as any).handle.kysely
      .updateTable('users')
      .set({ role_id: 'no-such-role' })
      .where('id', '=', id)
      .execute()
    invalidateAccess()
    const access = await createAccessResolver(server.adminStore)(id)
    expect(access.baseRole).toBe('viewer')
    expect(access.permissions.size).toBe(0)
  })

  it('PATCH /api/users/:id refuses a caller whose role grants less than the target’s', async () => {
    const role = await call(adminToken, 'POST', '/api/roles', {
      name: 'Thin admin',
      baseRole: 'admin',
      permissions: ['connections:read'],
    })
    expect(role.statusCode).toBe(201)
    const thin = await createUserAndLogin(server, adminToken, 'thin', 'operator')
    const thinId = await idOf('thin')
    expect(
      (await call(adminToken, 'PUT', `/api/users/${thinId}/role`, { roleId: role.json().data.id })).statusCode,
    ).toBe(200)
    const adminId = await idOf('admin')
    const password = 'BrandNewPassw0rd!Xyz'
    const denied = await call(thin, 'PATCH', `/api/users/${adminId}`, { password })
    expect(denied.statusCode).toBe(403)
    // A full admin can still reset it.
    expect((await call(adminToken, 'PATCH', `/api/users/${adminId}`, { password })).statusCode).toBe(200)
  })

  describe('dashboard dismissals for restricted callers', () => {
    it('hide keys that embed another tenant’s connection or sync job', async () => {
      const { UnifiedClient } = await import('../../src/core/proxy/client')
      const { vi } = await import('vitest')
      const conns: Record<string, { tenantId: string; vertical: string }> = {
        c_acme: { tenantId: 'acme', vertical: 'accounting' },
        c_globex: { tenantId: 'globex', vertical: 'accounting' },
      }
      const jobs: Record<string, { tenantId: string; vertical: string }> = {
        j_acme: { tenantId: 'acme', vertical: 'accounting' },
        j_globex: { tenantId: 'globex', vertical: 'accounting' },
      }
      const s1 = vi.spyOn(UnifiedClient.prototype, 'getConnection').mockImplementation(
        async (id: string) => (conns[id] ? ({ id, ...conns[id] } as never) : null),
      )
      const s2 = vi.spyOn(UnifiedClient.prototype, 'getSyncJob').mockImplementation(
        async (id: string) => (jobs[id] ? { id, ...jobs[id] } : null),
      )
      try {
        const keys = [
          'conn:expired:c_acme',
          'conn:expired:c_globex',
          'refresh:failing:c_globex',
          'sync:failed:j_acme',
          'sync:failed:j_globex',
          'platform:creds:accounting/xero',
        ]
        const created = await call(adminToken, 'POST', '/api/dashboard-tasks/dismissals', {
          items: keys.map((key) => ({ key, fingerprint: 'fp' })),
        })
        expect(created.statusCode).toBe(204)
        const viewer = await createUserAndLogin(server, adminToken, 'acme-v', 'viewer')
        await call(adminToken, 'PUT', `/api/users/${await idOf('acme-v')}/scope`, ACME_ONLY)
        const seen = ((await call(viewer, 'GET', '/api/dashboard-tasks/dismissals')).json().data as Array<{ key: string }>)
          .map((d) => d.key)
          .sort()
        expect(seen).toEqual(['conn:expired:c_acme', 'platform:creds:accounting/xero', 'sync:failed:j_acme'])
        const all = (await call(adminToken, 'GET', '/api/dashboard-tasks/dismissals')).json().data as unknown[]
        expect(all).toHaveLength(keys.length)
      } finally {
        s1.mockRestore()
        s2.mockRestore()
      }
    })
  })
})
