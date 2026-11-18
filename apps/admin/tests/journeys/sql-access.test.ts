/**
 * SQL access: the SQLite empty state, the Postgres status card with its
 * provision button (managed) or copyable script (manual), the principals
 * table and catalog browser, gating by `sql_access:manage` (page and nav)
 * and `data:read_pii` (the unmasked option), and the one-time password page
 * — served uncached, with psql/JDBC snippets on the advertised read host,
 * and gone from every later page.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'

const mockGetMyAccess = vi.fn()
const mockListTenants = vi.fn()
const mockGetSqlAccessStatus = vi.fn()
const mockListSqlPrincipals = vi.fn()
const mockGetSqlAccessCatalog = vi.fn()
const mockGetSqlAccessProvisionScript = vi.fn()
const mockProvisionSqlAccess = vi.fn()
const mockCreateSqlPrincipal = vi.fn()
const mockRotateSqlPrincipal = vi.fn()
const mockRevokeSqlPrincipal = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getMyAccess: mockGetMyAccess,
      listTenants: mockListTenants,
      getSqlAccessStatus: mockGetSqlAccessStatus,
      listSqlPrincipals: mockListSqlPrincipals,
      getSqlAccessCatalog: mockGetSqlAccessCatalog,
      getSqlAccessProvisionScript: mockGetSqlAccessProvisionScript,
      provisionSqlAccess: mockProvisionSqlAccess,
      createSqlPrincipal: mockCreateSqlPrincipal,
      rotateSqlPrincipal: mockRotateSqlPrincipal,
      revokeSqlPrincipal: mockRevokeSqlPrincipal,
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'sql-access-journey-session-secret-long-enough'
const PASSWORD = 'k3JqT9vXpLm2Rw8NsYb4Cd6Fh7Gj9Kz2Qx5Tv3Wa'
let fastify: FastifyInstance
let seq = 0

const MANAGER = ['connections:read', 'data:read', 'sql_access:manage']
const MANAGER_PII = [...MANAGER, 'data:read_pii']

const STATUS = {
  backend: 'postgres',
  mode: 'managed',
  provisioned: true,
  version: 2,
  hash: 'abc',
  catalogHash: 'abc',
  upToDate: true,
  readHost: 'replica.internal',
  database: 'opensteward',
  schemas: { masked: 'os_analytics', pii: 'os_analytics_pii' },
  pgcrypto: true,
  warnings: [],
}

const PRINCIPAL = {
  id: 'p-1',
  username: 'os_sql_metabase_3f9a1c',
  label: 'Metabase',
  pii: false,
  scope: { tenants: ['acme'], verticals: ['crm'] },
  connectionLimit: 5,
  createdBy: 'u1',
  createdAt: '2026-09-29T12:00:00.000Z',
  expiresAt: null,
  revokedAt: null,
  lastRotatedAt: null,
  status: 'active',
  searchPath: 'os_analytics',
}

function session(role: 'viewer' | 'operator' | 'admin') {
  seq += 1
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: role, role, token: `jwt-${seq}` }))
}
function access(permissions: string[], scope: unknown = { mode: 'all', grants: [] }) {
  mockGetMyAccess.mockResolvedValue({ roleId: 'r', roleName: 'r', permissions, scope })
}
function get(url: string) {
  return fastify.inject({ method: 'GET', url, cookies: { session: session('operator') } })
}
function post(url: string, body: Record<string, string | string[]> = {}) {
  const c = session('operator')
  const _csrf = createHmac('sha256', SESSION_SECRET).update(c).digest('hex').slice(0, 32)
  const form = new URLSearchParams()
  form.append('_csrf', _csrf)
  for (const [k, v] of Object.entries(body)) {
    for (const one of Array.isArray(v) ? v : [v]) form.append(k, one)
  }
  return fastify.inject({
    method: 'POST',
    url,
    cookies: { session: c },
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: form.toString(),
  })
}

beforeEach(async () => {
  for (const m of [
    mockGetMyAccess,
    mockListTenants,
    mockGetSqlAccessStatus,
    mockListSqlPrincipals,
    mockGetSqlAccessCatalog,
    mockGetSqlAccessProvisionScript,
    mockProvisionSqlAccess,
    mockCreateSqlPrincipal,
    mockRotateSqlPrincipal,
    mockRevokeSqlPrincipal,
  ]) {
    m.mockReset()
  }
  mockListTenants.mockResolvedValue([
    { id: 'acme', name: 'Acme' },
    { id: 'globex', name: 'Globex' },
  ])
  mockGetSqlAccessStatus.mockResolvedValue(STATUS)
  mockListSqlPrincipals.mockResolvedValue([
    PRINCIPAL,
    {
      ...PRINCIPAL,
      id: 'p-2',
      username: 'os_sql_old_1a2b3c',
      label: 'Old',
      status: 'revoked',
      revokedAt: '2026-09-01T00:00:00.000Z',
      pii: true,
    },
  ])
  mockGetSqlAccessCatalog.mockResolvedValue({
    format: 1,
    hash: 'abc',
    schemas: { masked: 'os_analytics', pii: 'os_analytics_pii' },
    views: [
      {
        name: 'crm_contacts',
        kind: 'resource',
        vertical: 'crm',
        resourceType: 'contacts',
        columns: [
          {
            name: 'connection_id',
            source: 'store',
            type: 'text',
            maskedType: 'text',
            class: 'internal',
          },
          {
            name: 'email',
            source: 'field',
            field: 'email',
            type: 'text',
            maskedType: 'text',
            class: 'pii',
            mask: 'email',
          },
        ],
      },
    ],
  })
  mockCreateSqlPrincipal.mockResolvedValue({
    principal: PRINCIPAL,
    password: PASSWORD,
    connection: {
      host: 'replica.internal',
      username: PRINCIPAL.username,
      searchPath: 'os_analytics',
    },
    mode: 'managed',
  })
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

describe('gating', () => {
  it('refuses a user without sql_access:manage and hides the nav item', async () => {
    access(['connections:read', 'data:read'])
    const res = await get('/sql-access')
    expect(res.statusCode).toBe(403)
    expect(mockGetSqlAccessStatus).not.toHaveBeenCalled()
    expect((await get('/connections')).body).not.toContain('href="/sql-access"')
  })

  it('shows the nav item to a holder', async () => {
    access(MANAGER)
    const res = await get('/sql-access')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('href="/sql-access"')
    expect(String(res.headers['content-security-policy'])).toContain("script-src 'self'")
  })
})

describe('SQLite', () => {
  it('explains that SQL access needs Postgres and calls nothing else', async () => {
    access(MANAGER)
    mockGetSqlAccessStatus.mockResolvedValue({
      ...STATUS,
      backend: 'sqlite',
      mode: 'manual',
      provisioned: false,
      version: null,
      readHost: null,
      database: null,
    })
    const res = await get('/sql-access')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('SQL access needs the Postgres backend')
    expect(res.body).toContain('http://localhost:3003/guides/deployment/postgres-analytics.md')
    expect(res.body).not.toContain('href="/sql-access/principals/new"')
    expect(mockListSqlPrincipals).not.toHaveBeenCalled()
    expect(mockGetSqlAccessProvisionScript).not.toHaveBeenCalled()
  })
})

describe('Postgres', () => {
  it('renders status, principals and the catalog with class badges', async () => {
    access(MANAGER)
    const res = await get('/sql-access')
    const body = res.body
    expect(body).toContain('data-sql-status')
    expect(body).toContain('replica.internal')
    expect(body).toContain('version 2')
    expect(body).toMatch(/action="\/sql-access\/provision"[^>]*data-provision-form\s+data-confirm=/)
    expect(body).toContain('os_sql_metabase_3f9a1c')
    expect(body).toContain('acme · crm')
    expect(body).toContain('action="/sql-access/principals/p-1/rotate"')
    expect(body).toContain('action="/sql-access/principals/p-1/revoke"')
    // Revoked logins stay listed, without actions.
    expect(body).toContain('badge--danger">revoked')
    expect(body).not.toContain('action="/sql-access/principals/p-2/rotate"')
    expect(body).toContain('crm_contacts')
    expect(body).toContain('>PII</span>')
    expect(mockGetSqlAccessProvisionScript).not.toHaveBeenCalled()
  })

  it('shows the manual-mode script in a copyable <pre>', async () => {
    access(MANAGER)
    mockGetSqlAccessStatus.mockResolvedValue({ ...STATUS, mode: 'manual', provisioned: false })
    mockGetSqlAccessProvisionScript.mockResolvedValue(
      'BEGIN;\nCREATE ROLE "os_analytics_owner" NOLOGIN;\nCOMMIT;\n',
    )
    const res = await get('/sql-access')
    expect(res.body).toContain('data-provision-script')
    expect(res.body).toContain('CREATE ROLE &#34;os_analytics_owner&#34; NOLOGIN;')
    expect(res.body).toMatch(/data-copy="BEGIN;/)
    expect(res.body).not.toContain('data-provision-form')
  })

  it('provisions with a toast', async () => {
    access(MANAGER)
    mockProvisionSqlAccess.mockResolvedValue({
      changed: true,
      version: 3,
      hash: 'x',
      breaking: false,
      changes: [],
      warnings: [],
    })
    const res = await post('/sql-access/provision')
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/sql-access')
    expect(mockProvisionSqlAccess).toHaveBeenCalledTimes(1)
  })
})

describe('principals', () => {
  it('offers the unmasked option only with data:read_pii', async () => {
    access(MANAGER)
    expect((await get('/sql-access/principals/new')).body).not.toContain('name="pii"')
    access(MANAGER_PII)
    expect((await get('/sql-access/principals/new')).body).toContain('name="pii"')
  })

  it('shows the password once, uncached, with connection snippets', async () => {
    access(MANAGER_PII)
    const res = await post('/sql-access/principals', {
      label: 'Metabase',
      tenant_mode: 'some',
      tenants: 'acme',
      verticals: 'crm',
      expires: '2027-01-31',
      connection_limit: '3',
      pii: 'on',
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.body).toContain('data-password-once')
    expect(res.body).toContain(PASSWORD)
    expect(res.body).toContain(
      `psql &#34;postgresql://os_sql_metabase_3f9a1c:${PASSWORD}@replica.internal:5432/opensteward?sslmode=require&#34;`,
    )
    expect(res.body).toContain(
      'jdbc:postgresql://replica.internal:5432/opensteward?sslmode=require',
    )
    expect(res.headers['set-cookie'] ?? '').not.toContain(PASSWORD)
    expect(mockCreateSqlPrincipal.mock.calls[0]![1]).toEqual({
      label: 'Metabase',
      pii: true,
      scope: { tenants: ['acme'], verticals: ['crm'] },
      expiresAt: '2027-01-31T23:59:59Z',
      connectionLimit: 3,
    })

    // Nowhere to read it again.
    const again = await get('/sql-access')
    expect(again.body).not.toContain(PASSWORD)
  })

  it('re-renders the form on an upstream refusal', async () => {
    access(MANAGER)
    mockCreateSqlPrincipal.mockRejectedValue(
      Object.assign(new Error('403'), {
        response: {
          status: 403,
          data: {
            error: {
              code: 'SCOPE_EXCEEDS_CALLER',
              message: "The principal's scope exceeds yours.",
            },
          },
        },
      }),
    )
    const res = await post('/sql-access/principals', { label: 'x', tenant_mode: 'all' })
    expect(res.statusCode).toBe(403)
    expect(res.body).toContain('SCOPE_EXCEEDS_CALLER')
    expect(res.body).toContain('data-principal-form')
  })

  it('rotates to a fresh one-time password page', async () => {
    access(MANAGER)
    mockRotateSqlPrincipal.mockResolvedValue({
      principal: { ...PRINCIPAL, lastRotatedAt: '2026-09-30T00:00:00.000Z' },
      password: 'NEWPASSWORDvalue1234567890abcdefghijk',
      connection: { host: null, username: PRINCIPAL.username, searchPath: 'os_analytics' },
      mode: 'managed',
      sessionsTerminated: 2,
    })
    mockGetSqlAccessStatus.mockResolvedValue({ ...STATUS, readHost: null })
    const res = await post('/sql-access/principals/p-1/rotate')
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.body).toContain('Password rotated')
    expect(res.body).toContain('NEWPASSWORDvalue1234567890abcdefghijk')
    expect(res.body).toContain('2 open session(s) were ended')
    expect(res.body).toContain('@&lt;database-host&gt;:5432/opensteward')
  })

  it('revokes with a toast', async () => {
    access(MANAGER)
    mockRevokeSqlPrincipal.mockResolvedValue({
      principal: { ...PRINCIPAL, status: 'revoked' },
      mode: 'managed',
      sessionsTerminated: 1,
    })
    const res = await post('/sql-access/principals/p-1/revoke')
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/sql-access')
  })
})
