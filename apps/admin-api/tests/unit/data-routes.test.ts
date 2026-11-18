/**
 * `/api/data/*` — the admin data viewer's API. Pins: permission gating
 * (a viewer holds no `data:read`), the scope header sent upstream (tenants,
 * per-tenant verticals, `revealPii` only on a reveal by a `data:read_pii`
 * holder, `maskFinancial` from the runtime setting), the reveal audit row,
 * `include_pii` export gating, streaming, and upstream refusals passed
 * through with their own status and code.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Readable } from 'node:stream'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { openDb, type DbHandle } from '@opensteward/shared'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import { createAccessResolver, invalidateAccess } from '../../src/core/auth/access'
import { AdminStore } from '../../src/core/db/admin-store'
import { RuntimeSettingsStore } from '../../src/core/db/runtime-settings-store'
import { createDataRoutes } from '../../src/core/routes/data'
import type { DataScopeHeader, UnifiedClient } from '../../src/core/proxy/client'

const RECORD = {
  id: 'ct1',
  resourceType: 'contacts',
  vertical: 'crm',
  platform: 'hubspot',
  connectionId: 'conn-1',
  fetchedAt: 1767225600000,
  updatedAt: 1767225600000,
  changedAt: 1767225600000,
  normVersion: '1',
  data: { id: 'ct1', email: 'j***@example.com', createdAt: 1700000000 },
}

let app: FastifyInstance
let handle: DbHandle
let store: AdminStore
let settings: RuntimeSettingsStore
const client = {
  getDataSummary: vi.fn(),
  getDataSchema: vi.fn(),
  listDataRecords: vi.fn(),
  getDataRecord: vi.fn(),
  openDataExport: vi.fn(),
}

function upstreamError(status: number, code: string, message: string) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { error: { code, message } } },
  })
}

beforeEach(async () => {
  invalidateAccess()
  for (const fn of Object.values(client)) fn.mockReset()
  client.getDataSummary.mockResolvedValue({ data: [] })
  client.listDataRecords.mockResolvedValue({
    data: [RECORD],
    meta: { nextCursor: null, total: 1, totalCapped: false, piiRevealed: false },
  })
  client.getDataRecord.mockResolvedValue({ data: RECORD, meta: { piiRevealed: false } })
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
  await app.register(createDataRoutes(client as unknown as UnifiedClient, store, settings))
  await app.ready()
})

afterEach(async () => {
  await app?.close()
  await store?.close()
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

function req(method: 'GET' | 'POST', url: string, token: string, payload?: unknown) {
  return app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
  })
}

const REC_URL = '/api/data/connections/conn-1/resources/contacts/ct1'

describe('permission gating', () => {
  it('refuses a viewer (no data:read) on every read', async () => {
    const { token } = await tokenFor('viewer')
    for (const url of [
      '/api/data/summary',
      '/api/data/schema/crm/contacts',
      '/api/data/connections/conn-1/resources/contacts',
      REC_URL,
      '/api/data/connections/conn-1/resources/contacts/export',
    ]) {
      const res = await req('GET', url, token)
      expect(res.statusCode, url).toBe(403)
    }
    expect(client.getDataSummary).not.toHaveBeenCalled()
  })

  it('refuses an unauthenticated caller', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/data/summary' })
    expect(res.statusCode).toBe(401)
  })

  it('lets an operator read but not reveal', async () => {
    const { token } = await tokenFor('operator')
    expect((await req('GET', REC_URL, token)).statusCode).toBe(200)
    const reveal = await req('POST', `${REC_URL}/reveal`, token, {})
    expect(reveal.statusCode).toBe(403)
    expect(client.getDataRecord).toHaveBeenCalledTimes(1)
  })
})

describe('scope header', () => {
  it('sends tenants "*" for an unrestricted caller, never revealing on a read', async () => {
    const { token } = await tokenFor('admin')
    await req('GET', '/api/data/summary', token)
    expect(client.getDataSummary).toHaveBeenCalledWith({ tenants: '*' })
    await req('GET', REC_URL, token)
    const [scope, , , , reveal] = client.getDataRecord.mock.calls[0]!
    expect(scope).toEqual({ tenants: '*' })
    expect(reveal).toBe(false)
  })

  it('sends the tenants and per-tenant verticals of a restricted caller', async () => {
    const { token } = await tokenFor('operator', [
      { tenantId: 'acme', verticals: ['crm'] },
      { tenantId: 'globex', verticals: '*' },
    ])
    await req('GET', '/api/data/connections/conn-1/resources/contacts?limit=10&q=jane', token)
    const [scope, id, type, query] = client.listDataRecords.mock.calls[0]!
    expect(scope).toEqual({
      tenants: ['acme', 'globex'],
      tenantVerticals: { acme: ['crm'], globex: '*' },
    })
    expect([id, type]).toEqual(['conn-1', 'contacts'])
    expect(query).toMatchObject({ limit: '10', q: 'jane' })
  })

  it('adds maskFinancial when data_access.mask_financial is on', async () => {
    await settings.set('data_access.mask_financial', true, null)
    const { token } = await tokenFor('admin')
    await req('GET', '/api/data/summary', token)
    expect(client.getDataSummary).toHaveBeenCalledWith({ tenants: '*', maskFinancial: true })
  })
})

describe('reveal', () => {
  it('reveals for a data:read_pii holder, audits it and is not cacheable', async () => {
    const { id, token } = await tokenFor('admin')
    client.getDataRecord.mockResolvedValue({
      data: { ...RECORD, data: { id: 'ct1', email: 'jane@example.com' } },
      meta: { piiRevealed: true },
    })
    const res = await req('POST', `${REC_URL}/reveal`, token, { reason: 'Ticket #42' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.json().data.data.email).toBe('jane@example.com')
    const [scope, , , , reveal] = client.getDataRecord.mock.calls[0]!
    expect(scope).toEqual({ tenants: '*', revealPii: true })
    expect(reveal).toBe(true)

    const audit = await store.listAudit(100, 0, { action: 'data.pii_reveal' })
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ user_id: id, vertical: 'crm', target_id: 'ct1' })
    expect(JSON.parse(audit[0]!.detail!)).toEqual({
      connectionId: 'conn-1',
      resourceType: 'contacts',
      resourceId: 'ct1',
      reason: 'Ticket #42',
    })
  })

  it('writes no audit row when the record is not found', async () => {
    const { token } = await tokenFor('admin')
    client.getDataRecord.mockRejectedValue(
      upstreamError(404, 'RESOURCE_NOT_FOUND', 'No such record'),
    )
    const res = await req('POST', `${REC_URL}/reveal`, token, {})
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('RESOURCE_NOT_FOUND')
    expect(await store.listAudit(100, 0, { action: 'data.pii_reveal' })).toHaveLength(0)
  })
})

describe('records', () => {
  it('passes stored data through untouched and converts row timestamps to ISO', async () => {
    const { token } = await tokenFor('operator')
    const res = await req('GET', REC_URL, token)
    const body = res.json()
    expect(body.data.updatedAt).toBe('2026-01-01T00:00:00.000Z')
    // A numeric createdAt INSIDE the record stays what the platform sent.
    expect(body.data.data.createdAt).toBe(1700000000)
  })

  it('passes upstream refusals through with their code', async () => {
    const { token } = await tokenFor('operator')
    client.listDataRecords.mockRejectedValueOnce(
      upstreamError(400, 'FIELD_NOT_SEARCHABLE', "Field 'email' cannot be filtered"),
    )
    const bad = await req('GET', '/api/data/connections/conn-1/resources/contacts', token)
    expect(bad.statusCode).toBe(400)
    expect(bad.json().error.code).toBe('FIELD_NOT_SEARCHABLE')
    client.getDataSummary.mockRejectedValueOnce(
      upstreamError(409, 'DATA_STORE_DISABLED', 'The data store is off'),
    )
    const off = await req('GET', '/api/data/summary', token)
    expect(off.statusCode).toBe(409)
    expect(off.json().error.code).toBe('DATA_STORE_DISABLED')
  })
})

describe('export', () => {
  const EXPORT_URL = '/api/data/connections/conn-1/resources/contacts/export'

  function stream() {
    client.openDataExport.mockImplementation(async () => ({
      stream: Readable.from(['_id,email\r\n', 'ct1,j***@example.com\r\n']),
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="crm-contacts-conn-1.csv"',
      },
    }))
  }

  it('streams the upstream export and audits it', async () => {
    stream()
    const { id, token } = await tokenFor('operator')
    const res = await req('GET', `${EXPORT_URL}?format=csv`, token)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.headers['content-disposition']).toContain('attachment')
    expect(res.body).toBe('_id,email\r\nct1,j***@example.com\r\n')
    const [scope, , , query] = client.openDataExport.mock.calls[0]!
    expect(scope).toEqual({ tenants: '*' })
    expect((query as Record<string, unknown>)['reveal']).toBeUndefined()
    const audit = await store.listAudit(100, 0, { action: 'data.export' })
    expect(audit[0]).toMatchObject({ user_id: id, target_id: 'conn-1' })
    expect(JSON.parse(audit[0]!.detail!)).toEqual({
      connectionId: 'conn-1',
      resourceType: 'contacts',
      format: 'csv',
      includePii: false,
    })
  })

  it('refuses include_pii without data:read_pii', async () => {
    stream()
    const { token } = await tokenFor('operator')
    const res = await req('GET', `${EXPORT_URL}?include_pii=true`, token)
    expect(res.statusCode).toBe(403)
    expect(client.openDataExport).not.toHaveBeenCalled()
    expect(await store.listAudit(100, 0, { action: 'data.export' })).toHaveLength(0)
  })

  it('exports unmasked for a data:read_pii holder', async () => {
    stream()
    const { token } = await tokenFor('admin')
    const res = await req('GET', `${EXPORT_URL}?include_pii=true&format=ndjson`, token)
    expect(res.statusCode).toBe(200)
    const [scope, , , query] = client.openDataExport.mock.calls[0]!
    expect((scope as DataScopeHeader).revealPii).toBe(true)
    expect(query).toMatchObject({ reveal: 'pii', format: 'ndjson' })
    const audit = await store.listAudit(100, 0, { action: 'data.export' })
    expect(JSON.parse(audit[0]!.detail!).includePii).toBe(true)
  })

  it('passes an upstream 404 through without auditing', async () => {
    client.openDataExport.mockRejectedValue(
      upstreamError(404, 'CONNECTION_NOT_FOUND', 'No such connection.'),
    )
    const { token } = await tokenFor('operator')
    const res = await req('GET', EXPORT_URL, token)
    expect(res.statusCode).toBe(404)
    expect(await store.listAudit(100, 0, { action: 'data.export' })).toHaveLength(0)
  })
})
