/**
 * Roles pages and the user scope editor.
 *
 * The console reads the caller's permissions from admin-api's `/api/auth/me`
 * on each request (cached per token), so a custom role changes what the nav
 * offers without a re-login. These pin: the Roles link and pages follow
 * `roles:manage` rather than the base role, and the scope editor posts the
 * grants admin-api expects.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'

const mockGetMyAccess = vi.fn()
const mockListRoles = vi.fn()
const mockListPermissions = vi.fn()
const mockSetUserScope = vi.fn()
const mockAssignUserRole = vi.fn()
const mockGetUser = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getMyAccess: mockGetMyAccess,
      listRoles: mockListRoles,
      listPermissions: mockListPermissions,
      setUserScope: mockSetUserScope,
      assignUserRole: mockAssignUserRole,
      getUser: mockGetUser,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
    }),
  }
})

const { buildServer } = await import('../../src/core/server')
const { parseScopeForm } = await import('../../src/core/routes/users')

const SESSION_SECRET = 'roles-and-scope-session-secret-long-enough'
let fastify: FastifyInstance
let seq = 0

type Role = 'viewer' | 'operator' | 'admin'

/** A fresh token per session, so the per-token access cache never carries over. */
function session(role: Role) {
  seq += 1
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: role, role, token: `jwt-${seq}` }))
}
function get(url: string, role: Role) {
  return fastify.inject({ method: 'GET', url, cookies: { session: session(role) } })
}
function post(url: string, role: Role, body: Record<string, string | string[]>) {
  const c = session(role)
  const _csrf = createHmac('sha256', SESSION_SECRET).update(c).digest('hex').slice(0, 32)
  return fastify.inject({
    method: 'POST',
    url,
    cookies: { session: c },
    payload: { _csrf, ...body },
  })
}
function sidebarOf(body: string): string {
  return /<aside class="sidebar">[\s\S]*?<\/aside>/.exec(body)?.[0] ?? ''
}

const ALL = { mode: 'all', grants: [] }

beforeEach(async () => {
  for (const m of [
    mockGetMyAccess,
    mockListRoles,
    mockListPermissions,
    mockSetUserScope,
    mockAssignUserRole,
    mockGetUser,
  ]) {
    m.mockReset()
  }
  mockListRoles.mockResolvedValue([
    {
      id: 'viewer',
      name: 'viewer',
      description: null,
      baseRole: 'viewer',
      permissions: ['connections:read'],
      isBuiltin: true,
    },
  ])
  mockListPermissions.mockResolvedValue([
    {
      id: 'connections:read',
      description: 'View connections.',
      builtinRoles: ['viewer', 'operator', 'admin'],
    },
  ])
  const built = await buildServer({
    server: { port: 0, host: '127.0.0.1' },
    session: { secret: SESSION_SECRET },
    admin_api: { url: 'http://localhost:3001' },
    docs_server: { url: 'http://localhost:3003' },
    sso: { publicBaseUrl: 'http://localhost:3000' },
  })
  fastify = built.fastify
  await fastify.ready()
})

afterEach(async () => {
  await fastify?.close()
})

describe('roles pages follow roles:manage, not the base role', () => {
  it('shows an operator on a role-manager custom role the Roles link and page', async () => {
    mockGetMyAccess.mockResolvedValue({
      roleId: 'r1',
      roleName: 'Role manager',
      permissions: ['connections:read', 'roles:manage'],
      scope: ALL,
    })
    const dash = await get('/connections', 'operator')
    expect(sidebarOf(dash.body)).toContain('href="/roles"')
    // …but not the admin-only pages its base role cannot open.
    expect(sidebarOf(dash.body)).not.toContain('href="/users"')
    const roles = await get('/roles', 'operator')
    expect(roles.statusCode).toBe(200)
    expect(roles.body).toContain('Permission catalog')
  })

  it('refuses the roles page to a built-in operator (403 page, no link)', async () => {
    mockGetMyAccess.mockResolvedValue(null) // falls back to the built-in set
    const dash = await get('/connections', 'operator')
    expect(sidebarOf(dash.body)).not.toContain('href="/roles"')
    const roles = await get('/roles', 'operator')
    expect(roles.statusCode).toBe(403)
    expect(roles.body).toContain('roles:manage')
  })

  it('offers an admin the link from the built-in fallback when admin-api is unreachable', async () => {
    mockGetMyAccess.mockRejectedValue(new Error('connect ECONNREFUSED'))
    const dash = await get('/connections', 'admin')
    expect(sidebarOf(dash.body)).toContain('href="/roles"')
  })

  it('marks a tenant-scoped user in the header', async () => {
    mockGetMyAccess.mockResolvedValue({
      roleId: 'viewer',
      roleName: 'viewer',
      permissions: ['connections:read'],
      scope: { mode: 'restricted', grants: [{ tenantId: 'acme', verticals: '*' }] },
    })
    const res = await get('/connections', 'viewer')
    expect(res.body).toContain('>scoped<')
  })
})

describe('user scope editor', () => {
  it('parses ticked tenants and optional vertical lists', () => {
    expect(
      parseScopeForm({
        mode: 'restricted',
        tenants: ['acme', 'globex'],
        verticals_acme: '',
        verticals_globex: 'crm, accounting',
      }),
    ).toEqual({
      mode: 'restricted',
      grants: [
        { tenantId: 'acme', verticals: '*' },
        { tenantId: 'globex', verticals: ['crm', 'accounting'] },
      ],
      source: 'manual',
    })
    expect(parseScopeForm({ mode: 'all', tenants: 'acme', source: 'idp' })).toEqual({
      mode: 'all',
      grants: [],
      source: 'idp',
    })
  })

  it('posts the scope to admin-api and reports a refusal', async () => {
    mockGetMyAccess.mockResolvedValue(null)
    mockSetUserScope.mockResolvedValue({ mode: 'restricted', grants: [], source: 'manual' })
    const ok = await post('/users/u2/scope', 'admin', { mode: 'restricted', tenants: 'acme' })
    expect(ok.statusCode).toBe(302)
    expect(mockSetUserScope).toHaveBeenCalledWith(expect.any(String), 'u2', {
      mode: 'restricted',
      grants: [{ tenantId: 'acme', verticals: '*' }],
      source: 'manual',
    })
  })

  it('an admin’s scope card says admins see every tenant and offers no editor', async () => {
    mockGetMyAccess.mockResolvedValue({
      roleId: 'admin',
      roleName: 'admin',
      permissions: ['connections:read', 'users:manage'],
      scope: ALL,
    })
    mockGetUser.mockResolvedValue({
      id: 'u-admin',
      username: 'ada',
      role: 'admin',
      scope: ALL,
      links: [],
    })
    const res = await get('/users/u-admin', 'admin')
    expect(res.body).toContain('Admins always have every tenant.')
    expect(res.body).not.toContain('action="/users/u-admin/scope"')
  })

  it('a non-admin still gets the scope editor when the viewer holds users:manage', async () => {
    mockGetMyAccess.mockResolvedValue({
      roleId: 'admin',
      roleName: 'admin',
      permissions: ['connections:read', 'users:manage'],
      scope: ALL,
    })
    mockGetUser.mockResolvedValue({
      id: 'u-op',
      username: 'op',
      role: 'operator',
      scope: ALL,
      links: [],
    })
    const res = await get('/users/u-op', 'admin')
    expect(res.body).toContain('action="/users/u-op/scope"')
  })

  it('the role picker warns that admin means every tenant', async () => {
    mockGetMyAccess.mockResolvedValue(null)
    mockGetUser.mockResolvedValue({
      id: 'u-op',
      username: 'op',
      role: 'operator',
      scope: ALL,
      links: [],
    })
    const res = await get('/users/u-op', 'admin')
    expect(res.body).toContain('Making someone an admin gives them every tenant')
    expect(res.body).toContain('data-base-role="viewer"')
  })

  it('assigns a custom role through the role picker', async () => {
    mockGetMyAccess.mockResolvedValue(null)
    mockAssignUserRole.mockResolvedValue({ id: 'u2', username: 'x', role: 'viewer' })
    const res = await post('/users/u2/role', 'admin', { roleId: 'custom-1' })
    expect(res.statusCode).toBe(302)
    expect(mockAssignUserRole).toHaveBeenCalledWith(expect.any(String), 'u2', 'custom-1')
  })
})
