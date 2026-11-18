/**
 * Roles, role/scope assignment and the escalation guards, through the real
 * server (`buildServer`), so the access resolver is wired exactly as in
 * production.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  buildAdminApiTestServer,
  createUserAndLogin,
  setupAdmin,
  type AdminApiTestServer,
} from '../journeys/helpers'
import { invalidateAccess } from '../../src/core/auth/access'

let server: AdminApiTestServer
let adminToken: string

beforeEach(async () => {
  invalidateAccess()
  server = await buildAdminApiTestServer()
  adminToken = await setupAdmin(server)
})

afterEach(async () => {
  await server?.cleanup()
})

async function call(
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

async function userId(username: string): Promise<string> {
  return (await server.adminStore.getUserByUsername(username))!.id
}

/** A user on a custom role that may manage roles and users but little else. */
async function roleManager(): Promise<{ token: string; id: string; roleId: string }> {
  const created = await call(adminToken, 'POST', '/api/roles', {
    name: 'Role manager',
    baseRole: 'operator',
    permissions: [
      'connections:read',
      'dashboards:view',
      'roles:manage',
      'users:manage',
      'data:read',
    ],
  })
  expect(created.statusCode).toBe(201)
  const roleId = created.json().data.id as string
  const token = await createUserAndLogin(server, adminToken, 'rm', 'operator')
  const id = await userId('rm')
  const assigned = await call(adminToken, 'PUT', `/api/users/${id}/role`, { roleId })
  expect(assigned.statusCode).toBe(200)
  return { token, id, roleId }
}

describe('permission catalog and /api/auth/me', () => {
  it('lists every permission with the built-in roles that hold it', async () => {
    const viewer = await createUserAndLogin(server, adminToken, 'val', 'viewer')
    const res = await call(viewer, 'GET', '/api/permissions')
    expect(res.statusCode).toBe(200)
    const pii = res.json().data.find((p: { id: string }) => p.id === 'data:read_pii')
    expect(pii.builtinRoles).toEqual(['admin'])
  })

  it('reports permissions and scope, read from the database', async () => {
    const viewer = await createUserAndLogin(server, adminToken, 'val', 'viewer')
    const me = await call(viewer, 'GET', '/api/auth/me')
    expect(me.json().user).toMatchObject({
      username: 'val',
      role: 'viewer',
      roleId: 'viewer',
      permissions: ['connections:read', 'dashboards:view'],
      scope: { mode: 'all', grants: [] },
    })

    // A change made after the token was issued shows up without re-login.
    await call(adminToken, 'POST', '/api/tenants', { id: 'acme', name: 'Acme' })
    await call(adminToken, 'PUT', `/api/users/${await userId('val')}/scope`, {
      mode: 'restricted',
      grants: [{ tenantId: 'acme', verticals: ['crm'] }],
    })
    const after = await call(viewer, 'GET', '/api/auth/me')
    expect(after.json().user.scope).toEqual({
      mode: 'restricted',
      grants: [{ tenantId: 'acme', verticals: ['crm'] }],
    })
  })
})

describe('role CRUD', () => {
  it('creates, edits and deletes a custom role, auditing each', async () => {
    const created = await call(adminToken, 'POST', '/api/roles', {
      name: 'Analyst',
      description: 'Reads data',
      baseRole: 'viewer',
      permissions: ['data:read', 'connections:read'],
    })
    expect(created.statusCode).toBe(201)
    const role = created.json().data
    expect(role.permissions).toEqual(['connections:read', 'data:read'])

    const dup = await call(adminToken, 'POST', '/api/roles', {
      name: 'analyst',
      baseRole: 'viewer',
      permissions: [],
    })
    expect(dup.statusCode).toBe(409)

    const patched = await call(adminToken, 'PATCH', `/api/roles/${role.id}`, {
      permissions: ['data:read', 'data:export', 'connections:read'],
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().data.permissions).toContain('data:export')

    const list = await call(adminToken, 'GET', '/api/roles')
    expect(list.json().data.map((r: { id: string }) => r.id)).toEqual([
      'viewer',
      'operator',
      'admin',
      role.id,
    ])

    expect((await call(adminToken, 'DELETE', `/api/roles/${role.id}`)).statusCode).toBe(204)
    const actions = (await server.adminStore.listAudit(100)).map((e) => e.action)
    expect(actions).toEqual(expect.arrayContaining(['role.create', 'role.update', 'role.delete']))
  })

  it('refuses to edit or delete a built-in role (409)', async () => {
    expect((await call(adminToken, 'PATCH', '/api/roles/admin', { name: 'root' })).statusCode).toBe(
      409,
    )
    expect((await call(adminToken, 'DELETE', '/api/roles/viewer')).statusCode).toBe(409)
  })

  it('refuses to delete a role in use by a user or an IdP rule (409)', async () => {
    const { roleId } = await roleManager()
    const res = await call(adminToken, 'DELETE', `/api/roles/${roleId}`)
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toMatch(/assigned to 1 user/)

    const unused = (
      await call(adminToken, 'POST', '/api/roles', {
        name: 'Ruled',
        baseRole: 'viewer',
        permissions: [],
      })
    ).json().data.id as string
    const idp = await call(adminToken, 'POST', '/api/identity-providers', {
      name: 'Okta',
      slug: 'okta',
      protocol: 'oidc',
      config: { issuer: 'https://idp.example', clientId: 'opensteward' },
    })
    expect(idp.statusCode, idp.payload).toBe(201)
    const rule = await call(
      adminToken,
      'POST',
      `/api/identity-providers/${idp.json().data.id}/role-mappings`,
      {
        claimPath: 'groups',
        matchType: 'equals',
        matchValue: 'ruled',
        roleId: unused,
      },
    )
    expect(rule.statusCode).toBe(201)
    expect(rule.json().data).toMatchObject({ role: 'viewer', roleId: unused })
    const blocked = await call(adminToken, 'DELETE', `/api/roles/${unused}`)
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().error).toMatch(/role-mapping rule/)
  })

  it('denies role management without roles:manage', async () => {
    const operator = await createUserAndLogin(server, adminToken, 'op', 'operator')
    const res = await call(operator, 'POST', '/api/roles', {
      name: 'X',
      baseRole: 'viewer',
      permissions: [],
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('Forbidden — missing permission roles:manage')
    expect((await call(operator, 'GET', '/api/roles')).statusCode).toBe(403)
  })
})

describe('escalation guards', () => {
  it('a role manager cannot create a role with a permission or base role it lacks', async () => {
    const rm = await roleManager()
    const pii = await call(rm.token, 'POST', '/api/roles', {
      name: 'PII',
      baseRole: 'viewer',
      permissions: ['data:read_pii'],
    })
    expect(pii.statusCode).toBe(403)
    expect(pii.json().error).toMatch(/data:read_pii/)

    const adminBase = await call(rm.token, 'POST', '/api/roles', {
      name: 'Sneaky',
      baseRole: 'admin',
      permissions: ['connections:read'],
    })
    expect(adminBase.statusCode).toBe(403)

    const ok = await call(rm.token, 'POST', '/api/roles', {
      name: 'Reader',
      baseRole: 'viewer',
      permissions: ['connections:read', 'data:read'],
    })
    expect(ok.statusCode).toBe(201)
  })

  it('a role manager cannot edit a role that holds more than it does', async () => {
    const rm = await roleManager()
    const big = (
      await call(adminToken, 'POST', '/api/roles', {
        name: 'Big',
        baseRole: 'operator',
        permissions: ['data:read_pii'],
      })
    ).json().data.id as string
    expect((await call(rm.token, 'PATCH', `/api/roles/${big}`, { name: 'Small' })).statusCode).toBe(
      403,
    )
    // …nor widen its own role.
    const own = await call(rm.token, 'PATCH', `/api/roles/${rm.roleId}`, {
      permissions: [
        'connections:read',
        'dashboards:view',
        'roles:manage',
        'users:manage',
        'data:read',
        'settings:manage',
      ],
    })
    expect(own.statusCode).toBe(403)
  })

  it('a user manager can only assign roles within its own permissions, to users below it', async () => {
    const rm = await roleManager()
    await createUserAndLogin(server, adminToken, 'vic', 'viewer')
    const vic = await userId('vic')

    const toAdmin = await call(rm.token, 'PUT', `/api/users/${vic}/role`, { roleId: 'admin' })
    expect(toAdmin.statusCode).toBe(403)
    const toOperator = await call(rm.token, 'PUT', `/api/users/${vic}/role`, { roleId: 'operator' })
    // operator holds data:export and dashboards:*, which the role manager lacks.
    expect(toOperator.statusCode).toBe(403)
    // viewer (connections:read + dashboards:view) is within what it holds.
    const toViewer = await call(rm.token, 'PUT', `/api/users/${vic}/role`, { roleId: 'viewer' })
    expect(toViewer.statusCode).toBe(200)

    const reader = (
      await call(rm.token, 'POST', '/api/roles', {
        name: 'Reader',
        baseRole: 'viewer',
        permissions: ['connections:read'],
      })
    ).json().data.id as string
    const assigned = await call(rm.token, 'PUT', `/api/users/${vic}/role`, { roleId: reader })
    expect(assigned.statusCode).toBe(200)
    expect(assigned.json().data).toMatchObject({
      role: 'viewer',
      roleId: reader,
      roleName: 'Reader',
    })

    // The admin holds more than the role manager: not theirs to change.
    const onAdmin = await call(rm.token, 'PUT', `/api/users/${await userId('admin')}/role`, {
      roleId: reader,
    })
    expect(onAdmin.statusCode).toBe(403)

    // Nobody changes their own role here.
    expect(
      (await call(rm.token, 'PUT', `/api/users/${rm.id}/role`, { roleId: reader })).statusCode,
    ).toBe(400)
  })

  it('refuses to move the last built-in admin off the admin role (409)', async () => {
    // A custom role on the admin base holding every permission is still not
    // a built-in admin, so it does not count toward the break-glass pool.
    const full = (
      await call(adminToken, 'POST', '/api/roles', {
        name: 'Custom admin',
        baseRole: 'admin',
        permissions: (await call(adminToken, 'GET', '/api/permissions'))
          .json()
          .data.map((p: { id: string }) => p.id),
      })
    ).json().data.id as string
    const other = await createUserAndLogin(server, adminToken, 'other', 'admin')
    expect(
      (await call(adminToken, 'PUT', `/api/users/${await userId('other')}/role`, { roleId: full }))
        .statusCode,
    ).toBe(200)
    const res = await call(other, 'PUT', `/api/users/${await userId('admin')}/role`, {
      roleId: 'operator',
    })
    expect(res.statusCode).toBe(409)
  })

  it('a restricted user manager can only grant tenants inside its own scope', async () => {
    const rm = await roleManager()
    await call(adminToken, 'POST', '/api/tenants', { id: 'acme', name: 'Acme' })
    await call(adminToken, 'POST', '/api/tenants', { id: 'globex', name: 'Globex' })
    await call(adminToken, 'PUT', `/api/users/${rm.id}/scope`, {
      mode: 'restricted',
      grants: [{ tenantId: 'acme', verticals: '*' }],
    })
    await createUserAndLogin(server, adminToken, 'vic', 'viewer')
    const vic = await userId('vic')

    // vic is unrestricted today — broader than rm, so rm cannot touch it.
    const first = await call(rm.token, 'PUT', `/api/users/${vic}/scope`, {
      mode: 'restricted',
      grants: [{ tenantId: 'acme', verticals: '*' }],
    })
    expect(first.statusCode).toBe(403)

    await call(adminToken, 'PUT', `/api/users/${vic}/scope`, {
      mode: 'restricted',
      grants: [{ tenantId: 'acme', verticals: '*' }],
    })
    const outside = await call(rm.token, 'PUT', `/api/users/${vic}/scope`, {
      mode: 'restricted',
      grants: [{ tenantId: 'globex', verticals: '*' }],
    })
    expect(outside.statusCode).toBe(403)
    const all = await call(rm.token, 'PUT', `/api/users/${vic}/scope`, { mode: 'all' })
    expect(all.statusCode).toBe(403)
    const narrower = await call(rm.token, 'PUT', `/api/users/${vic}/scope`, {
      mode: 'restricted',
      grants: [{ tenantId: 'acme', verticals: ['crm'] }],
    })
    expect(narrower.statusCode).toBe(200)
    expect(narrower.json().data).toEqual({
      mode: 'restricted',
      source: 'manual',
      grants: [{ tenantId: 'acme', verticals: ['crm'] }],
    })
    const actions = (await server.adminStore.listAudit(100)).map((e) => e.action)
    expect(actions).toContain('user.scope_update')
    expect(actions).toContain('user.role_assign')
  })

  it('rejects an unknown tenant in a scope (400)', async () => {
    await createUserAndLogin(server, adminToken, 'vic', 'viewer')
    const res = await call(adminToken, 'PUT', `/api/users/${await userId('vic')}/scope`, {
      mode: 'restricted',
      grants: [{ tenantId: 'nope', verticals: '*' }],
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('tenant-restricted callers', () => {
  async function restrictedOperator(): Promise<string> {
    await call(adminToken, 'POST', '/api/tenants', { id: 'acme', name: 'Acme' })
    await call(adminToken, 'POST', '/api/tenants', { id: 'globex', name: 'Globex' })
    const token = await createUserAndLogin(server, adminToken, 'scoped', 'operator')
    await call(adminToken, 'PUT', `/api/users/${await userId('scoped')}/scope`, {
      mode: 'restricted',
      grants: [{ tenantId: 'acme', verticals: '*' }],
    })
    return token
  }

  it('lists only granted tenants and 404s the rest', async () => {
    const token = await restrictedOperator()
    const list = await call(token, 'GET', '/api/tenants')
    expect(list.json().data.map((t: { id: string }) => t.id)).toEqual(['acme'])
    expect((await call(token, 'PUT', '/api/tenants/globex', { name: 'Mine now' })).statusCode).toBe(
      404,
    )
    expect((await call(token, 'PUT', '/api/tenants/acme', { name: 'Acme Inc' })).statusCode).toBe(
      200,
    )
    const create = await call(token, 'POST', '/api/tenants', { id: 'new', name: 'New' })
    expect(create.statusCode).toBe(403)
    expect(create.json().error.code).toBe('SCOPE_RESTRICTED')

    // The unrestricted admin still sees everything.
    const all = await call(adminToken, 'GET', '/api/tenants')
    expect(all.json().data.map((t: { id: string }) => t.id)).toEqual(['acme', 'default', 'globex'])
  })

  it('is refused (SCOPE_RESTRICTED) on surfaces that are not tenant-scoped yet', async () => {
    const token = await restrictedOperator()
    for (const url of [
      '/api/api-keys',
      '/api/end-users',
      '/api/connect-sessions',
      '/api/webhook-subscriptions',
      '/api/end-user-tokens',
      '/api/oauth/issuers',
      '/api/connect-link-templates',
      '/api/data-store/metrics',
    ]) {
      const res = await call(token, 'GET', url)
      expect({ url, status: res.statusCode }).toEqual({ url, status: 403 })
      expect(res.json().error.code).toBe('SCOPE_RESTRICTED')
    }
  })
})
