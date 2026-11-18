/**
 * `/api/sql-access/*` — pins: `sql_access:manage` gates everything but the
 * catalog (`data:read`), the scope header (`revealPii` only for a
 * `data:read_pii` holder; never `maskFinancial`), `createdBy` from the JWT,
 * the one-time password sent `Cache-Control: no-store` and kept out of the
 * audit log, the text/plain provisioning script, and upstream refusals
 * (409 POSTGRES_REQUIRED, 403 SCOPE_EXCEEDS_CALLER) passed through.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { openDb, type DbHandle, type Permission } from '@opensteward/shared'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import { createAccessResolver, invalidateAccess } from '../../src/core/auth/access'
import { AdminStore } from '../../src/core/db/admin-store'
import { RuntimeSettingsStore } from '../../src/core/db/runtime-settings-store'
import { createSqlAccessRoutes } from '../../src/core/routes/sql-access'
import type { UnifiedClient } from '../../src/core/proxy/client'

const PASSWORD = 'k3JqT9vXpLm2Rw8NsYb4Cd6Fh7Gj9Kz2Qx5Tv3Wa'

const PRINCIPAL = {
  id: 'p-1',
  username: 'os_sql_metabase_3f9a1c',
  label: 'Metabase',
  pii: false,
  scope: { tenants: ['acme'] },
  connectionLimit: 5,
  createdBy: 'u1',
  createdAt: '2026-09-29T12:00:00.000Z',
  expiresAt: null,
  revokedAt: null,
  lastRotatedAt: null,
  status: 'active',
  searchPath: 'os_analytics',
}

const STATUS = {
  backend: 'postgres',
  mode: 'managed',
  provisioned: true,
  version: 1,
  hash: 'abc',
  catalogHash: 'abc',
  upToDate: true,
  readHost: 'replica.internal',
  database: 'opensteward',
  schemas: { masked: 'os_analytics', pii: 'os_analytics_pii' },
  pgcrypto: true,
  warnings: [],
}

let app: FastifyInstance
let handle: DbHandle
let store: AdminStore
let settings: RuntimeSettingsStore
const client = {
  getAnalyticsStatus: vi.fn(),
  getAnalyticsCatalog: vi.fn(),
  provisionAnalytics: vi.fn(),
  getAnalyticsProvisionScript: vi.fn(),
  listAnalyticsPrincipals: vi.fn(),
  createAnalyticsPrincipal: vi.fn(),
  rotateAnalyticsPrincipal: vi.fn(),
  revokeAnalyticsPrincipal: vi.fn(),
}

function upstreamError(status: number, code: string, message: string) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { error: { code, message } } },
  })
}

const withPassword = (principal = PRINCIPAL) => ({
  principal,
  password: PASSWORD,
  connection: {
    host: 'replica.internal',
    username: principal.username,
    searchPath: 'os_analytics',
  },
  mode: 'managed',
})

beforeEach(async () => {
  invalidateAccess()
  for (const fn of Object.values(client)) fn.mockReset()
  client.getAnalyticsStatus.mockResolvedValue(STATUS)
  client.getAnalyticsCatalog.mockResolvedValue({
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
            name: 'email',
            source: 'field',
            field: 'email',
            type: 'text',
            maskedType: 'text',
            class: 'pii',
            mask: 'email',
          },
        ],
        rules: [{ path: 'email', class: 'pii', mask: 'email' }],
      },
    ],
  })
  client.provisionAnalytics.mockResolvedValue({
    changed: true,
    version: 1,
    hash: 'abc',
    breaking: false,
    changes: [],
    warnings: [],
  })
  client.getAnalyticsProvisionScript.mockResolvedValue('BEGIN;\nSELECT 1;\nCOMMIT;\n')
  client.listAnalyticsPrincipals.mockResolvedValue([PRINCIPAL])
  client.createAnalyticsPrincipal.mockResolvedValue(withPassword())
  client.rotateAnalyticsPrincipal.mockResolvedValue({
    ...withPassword({ ...PRINCIPAL, lastRotatedAt: '2026-09-30T00:00:00.000Z' }),
    sessionsTerminated: 2,
  })
  client.revokeAnalyticsPrincipal.mockResolvedValue({
    principal: { ...PRINCIPAL, status: 'revoked', revokedAt: '2026-09-30T00:00:00.000Z' },
    mode: 'managed',
    sessionsTerminated: 1,
  })
  handle = await openDb({ sqlitePath: ':memory:' })
  store = await AdminStore.create(handle)
  settings = await RuntimeSettingsStore.create(handle)
  app = Fastify({ logger: false })
  await registerOpenApiBridge(app)
  await app.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
  app.decorate('authenticate', requireAuth)
  app.decorate('operatorOnly', requireRole('operator'))
  app.decorate('adminOnly', requireRole('admin'))
  app.decorate('accessResolver', createAccessResolver(store))
  await app.register(createSqlAccessRoutes(client as unknown as UnifiedClient, store))
  await app.ready()
})

afterEach(async () => {
  await app?.close()
  await store?.close()
})

async function tokenFor(
  role: 'viewer' | 'operator' | 'admin',
  opts: {
    scope?: Array<{ tenantId: string; verticals: '*' | string[] }>
    permissions?: Permission[]
  } = {},
) {
  const user = await store.createUser(`u-${Math.random()}`, 'hash', role)
  if (opts.permissions) {
    const r = await store.createRole({
      name: `r-${Math.random()}`,
      baseRole: role,
      permissions: opts.permissions,
      createdBy: null,
    })
    await store.assignUserRole(user.id, r.id)
  }
  if (opts.scope) {
    await store.setUserScope(user.id, { mode: 'restricted', grants: opts.scope }, 'manual')
  }
  return { id: user.id, token: app.jwt.sign({ id: user.id, username: user.username, role }) }
}

function req(method: 'GET' | 'POST' | 'DELETE', url: string, token: string, payload?: unknown) {
  return app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
  })
}

const CREATE = { label: 'Metabase', scope: { tenants: ['acme'] } }

describe('permission gating', () => {
  it('refuses an operator (no sql_access:manage) on every managing route', async () => {
    const { token } = await tokenFor('operator')
    const calls: Array<[Parameters<typeof req>[0], string, unknown?]> = [
      ['GET', '/api/sql-access/status'],
      ['POST', '/api/sql-access/provision', {}],
      ['GET', '/api/sql-access/provision-script'],
      ['GET', '/api/sql-access/principals'],
      ['POST', '/api/sql-access/principals', CREATE],
      ['POST', '/api/sql-access/principals/p-1/rotate', {}],
      ['DELETE', '/api/sql-access/principals/p-1'],
    ]
    for (const [method, url, body] of calls) {
      const res = await req(method, url, token, body)
      expect(res.statusCode, `${method} ${url}`).toBe(403)
    }
    for (const fn of Object.values(client)) expect(fn).not.toHaveBeenCalled()
  })

  it('serves the catalog on data:read alone', async () => {
    const { token } = await tokenFor('operator')
    const res = await req('GET', '/api/sql-access/catalog', token)
    expect(res.statusCode).toBe(200)
    expect(res.json().data.views[0].columns[0]).toMatchObject({ name: 'email', class: 'pii' })
    const viewer = await tokenFor('viewer')
    expect((await req('GET', '/api/sql-access/catalog', viewer.token)).statusCode).toBe(403)
  })
})

describe('scope header', () => {
  it('sends revealPii for a data:read_pii holder and never maskFinancial', async () => {
    await settings.set('data_access.mask_financial', true, null)
    const { token } = await tokenFor('admin')
    await req('GET', '/api/sql-access/principals', token)
    expect(client.listAnalyticsPrincipals).toHaveBeenCalledWith({ tenants: '*', revealPii: true })
  })

  it('sends the tenants of a restricted caller without revealPii', async () => {
    const { token } = await tokenFor('operator', {
      permissions: ['sql_access:manage'],
      scope: [{ tenantId: 'acme', verticals: '*' }],
    })
    await req('GET', '/api/sql-access/principals', token)
    expect(client.listAnalyticsPrincipals).toHaveBeenCalledWith({
      tenants: ['acme'],
      tenantVerticals: { acme: '*' },
    })
  })
})

describe('principals', () => {
  it('returns the password once, uncached, and audits without it', async () => {
    const { id, token } = await tokenFor('admin')
    const res = await req('POST', '/api/sql-access/principals', token, {
      ...CREATE,
      expiresAt: '2027-01-01T00:00:00Z',
    })
    expect(res.statusCode).toBe(201)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.json().data.password).toBe(PASSWORD)
    expect(res.json().data.connection.host).toBe('replica.internal')
    const [, body] = client.createAnalyticsPrincipal.mock.calls[0]!
    expect(body).toMatchObject({ label: 'Metabase', createdBy: id })

    const audit = await store.listAudit(100, 0, { action: 'sql_access.principal_create' })
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ user_id: id, target_id: 'p-1' })
    expect(JSON.parse(audit[0]!.detail!)).toEqual({
      principalId: 'p-1',
      username: 'os_sql_metabase_3f9a1c',
      label: 'Metabase',
      pii: false,
      tenants: ['acme'],
      verticals: null,
      expiresAt: null,
    })
    expect(audit[0]!.detail).not.toContain(PASSWORD)
  })

  it('refuses a PII principal without data:read_pii before calling upstream', async () => {
    const { token } = await tokenFor('operator', { permissions: ['sql_access:manage'] })
    const res = await req('POST', '/api/sql-access/principals', token, { ...CREATE, pii: true })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('PII_NOT_ALLOWED')
    expect(client.createAnalyticsPrincipal).not.toHaveBeenCalled()
  })

  it('rotates with no-store and audits sessions ended, never the password', async () => {
    const { token } = await tokenFor('admin')
    const res = await req('POST', '/api/sql-access/principals/p-1/rotate', token, {})
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.json().data.password).toBe(PASSWORD)
    const audit = await store.listAudit(100, 0, { action: 'sql_access.principal_rotate' })
    expect(JSON.parse(audit[0]!.detail!)).toEqual({
      principalId: 'p-1',
      username: 'os_sql_metabase_3f9a1c',
      sessionsTerminated: 2,
    })
    expect(audit[0]!.detail).not.toContain(PASSWORD)
  })

  it('revokes and audits it', async () => {
    const { token } = await tokenFor('admin')
    const res = await req('DELETE', '/api/sql-access/principals/p-1', token)
    expect(res.statusCode).toBe(200)
    expect(res.json().data.principal.status).toBe('revoked')
    const audit = await store.listAudit(100, 0, { action: 'sql_access.principal_revoke' })
    expect(JSON.parse(audit[0]!.detail!)).toMatchObject({
      principalId: 'p-1',
      sessionsTerminated: 1,
    })
  })
})

describe('provisioning', () => {
  it('provisions and audits it', async () => {
    const { token } = await tokenFor('admin')
    const res = await req('POST', '/api/sql-access/provision', token, {})
    expect(res.statusCode).toBe(200)
    const audit = await store.listAudit(100, 0, { action: 'sql_access.provision' })
    expect(JSON.parse(audit[0]!.detail!)).toEqual({ changed: true, version: 1, breaking: false })
  })

  it('serves the script as text/plain', async () => {
    const { token } = await tokenFor('admin')
    const res = await req('GET', '/api/sql-access/provision-script', token)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/plain')
    expect(res.body).toBe('BEGIN;\nSELECT 1;\nCOMMIT;\n')
  })

  it('returns status, including on SQLite', async () => {
    client.getAnalyticsStatus.mockResolvedValueOnce({
      ...STATUS,
      backend: 'sqlite',
      provisioned: false,
      version: null,
      hash: null,
      upToDate: false,
      database: null,
      pgcrypto: null,
    })
    const { token } = await tokenFor('admin')
    const res = await req('GET', '/api/sql-access/status', token)
    expect(res.statusCode).toBe(200)
    expect(res.json().data.backend).toBe('sqlite')
  })
})

describe('upstream refusals', () => {
  it('pass through with their status and code, and write no audit row', async () => {
    const { token } = await tokenFor('admin')
    client.listAnalyticsPrincipals.mockRejectedValueOnce(
      upstreamError(409, 'POSTGRES_REQUIRED', 'Read-only SQL access needs the Postgres backend.'),
    )
    const pg = await req('GET', '/api/sql-access/principals', token)
    expect(pg.statusCode).toBe(409)
    expect(pg.json().error.code).toBe('POSTGRES_REQUIRED')

    client.createAnalyticsPrincipal.mockRejectedValueOnce(
      upstreamError(403, 'SCOPE_EXCEEDS_CALLER', "The principal's scope exceeds yours."),
    )
    const wide = await req('POST', '/api/sql-access/principals', token, CREATE)
    expect(wide.statusCode).toBe(403)
    expect(wide.json().error.code).toBe('SCOPE_EXCEEDS_CALLER')

    client.provisionAnalytics.mockRejectedValueOnce(
      upstreamError(409, 'MANUAL_MODE', 'ANALYTICS_ADMIN_DATABASE_URL is not set.'),
    )
    const manual = await req('POST', '/api/sql-access/provision', token, {})
    expect(manual.statusCode).toBe(409)
    expect(manual.json().error.code).toBe('MANUAL_MODE')

    expect(await store.listAudit(100, 0, { action: 'sql_access.principal_create' })).toHaveLength(0)
    expect(await store.listAudit(100, 0, { action: 'sql_access.provision' })).toHaveLength(0)
  })
})
