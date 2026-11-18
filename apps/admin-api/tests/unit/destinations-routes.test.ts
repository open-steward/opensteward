/**
 * `/api/destinations/*` — pins: `destinations:manage` gates every route (an
 * operator holds none by default), the scope header sent upstream (tenants
 * and per-tenant verticals; `revealPii` only for a `data:read_pii` holder),
 * the signed-in user sent as `actor`, audit rows for every write without a
 * secret value in them, ISO timestamps, and upstream refusals passed through
 * with their own status and code.
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
import { createDestinationsRoutes } from '../../src/core/routes/destinations'
import type { UnifiedClient } from '../../src/core/proxy/client'

const DEST = {
  id: 'dest-1',
  name: 'Lake',
  type: 's3',
  config: { bucket: 'lake', region: 'eu-west-1', prefix: '' },
  secretFieldsSet: ['accessKeyId', 'secretAccessKey'],
  includePii: false,
  piiApprovedBy: null,
  scope: { tenants: ['acme'] },
  intervalSec: 3600,
  enabled: true,
  createdBy: 'u1',
  createdAt: 1767225600000,
  updatedAt: 1767225600000,
  lastRunAt: null,
  lastStatus: null,
  lastError: null,
}

const SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'

let app: FastifyInstance
let handle: DbHandle
let store: AdminStore
let settings: RuntimeSettingsStore
const client = {
  listDestinationTypes: vi.fn(),
  listDestinations: vi.fn(),
  getDestination: vi.fn(),
  createDestination: vi.fn(),
  updateDestination: vi.fn(),
  deleteDestination: vi.fn(),
  setDestinationCredentials: vi.fn(),
  testDestination: vi.fn(),
  runDestination: vi.fn(),
  backfillDestination: vi.fn(),
  listDestinationRuns: vi.fn(),
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
  client.listDestinationTypes.mockResolvedValue([
    {
      type: 's3',
      label: 'Amazon S3',
      kind: 'object_store',
      available: true,
      configSchema: { type: 'object' },
      secretsSchema: { type: 'object' },
      secretFields: ['accessKeyId', 'secretAccessKey'],
    },
  ])
  client.listDestinations.mockResolvedValue([DEST])
  client.getDestination.mockResolvedValue(DEST)
  client.createDestination.mockResolvedValue(DEST)
  client.updateDestination.mockResolvedValue({ ...DEST, intervalSec: 600 })
  client.deleteDestination.mockResolvedValue(undefined)
  client.setDestinationCredentials.mockResolvedValue(DEST)
  client.testDestination.mockResolvedValue({ ok: true, latencyMs: 12 })
  client.runDestination.mockResolvedValue({ runId: 'run-1' })
  client.backfillDestination.mockResolvedValue({ cursorsReset: 2, runId: 'run-2' })
  client.listDestinationRuns.mockResolvedValue([
    {
      id: 'run-1',
      destinationId: 'dest-1',
      trigger: 'manual',
      status: 'success',
      startedAt: 1767225600000,
      finishedAt: 1767225604000,
      rowsWritten: 10,
      deletesWritten: 0,
      files: [{ path: 'a.parquet', kind: 'rows', rows: 10 }],
      error: null,
    },
  ])
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
  await app.register(createDestinationsRoutes(client as unknown as UnifiedClient, store, settings))
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

function req(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  token: string,
  payload?: unknown,
) {
  return app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
  })
}

const CREATE = {
  name: 'Lake',
  type: 's3',
  config: { bucket: 'lake' },
  secrets: { accessKeyId: 'AKIAEXAMPLE', secretAccessKey: SECRET },
  scope: { tenants: ['acme'] },
}

async function auditDetails(action: string) {
  const rows = await store.listAudit(100, 0, { action })
  return rows.map((r) => ({ row: r, detail: JSON.parse(r.detail ?? 'null') }))
}

describe('permission gating', () => {
  it('refuses an operator (no destinations:manage) on every route', async () => {
    const { token } = await tokenFor('operator')
    const calls: Array<[Parameters<typeof req>[0], string, unknown?]> = [
      ['GET', '/api/destinations/types'],
      ['GET', '/api/destinations'],
      ['POST', '/api/destinations', CREATE],
      ['GET', '/api/destinations/dest-1'],
      ['PATCH', '/api/destinations/dest-1', { enabled: false }],
      ['DELETE', '/api/destinations/dest-1'],
      ['PUT', '/api/destinations/dest-1/credentials', { secrets: {} }],
      ['POST', '/api/destinations/dest-1/test', {}],
      ['POST', '/api/destinations/dest-1/run', {}],
      ['POST', '/api/destinations/dest-1/backfill', {}],
      ['GET', '/api/destinations/dest-1/runs'],
    ]
    for (const [method, url, body] of calls) {
      const res = await req(method, url, token, body)
      expect(res.statusCode, `${method} ${url}`).toBe(403)
    }
    for (const fn of Object.values(client)) expect(fn).not.toHaveBeenCalled()
  })

  it('refuses an unauthenticated caller', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/destinations' })
    expect(res.statusCode).toBe(401)
  })

  it('lets a custom role holding destinations:manage in', async () => {
    const { token } = await tokenFor('operator', { permissions: ['destinations:manage'] })
    const res = await req('GET', '/api/destinations', token)
    expect(res.statusCode).toBe(200)
    expect(res.json().data[0]).toMatchObject({
      id: 'dest-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastRunAt: null,
    })
  })
})

describe('scope header', () => {
  it('sends tenants "*" plus revealPii for an unrestricted admin', async () => {
    const { token } = await tokenFor('admin')
    await req('GET', '/api/destinations', token)
    expect(client.listDestinations).toHaveBeenCalledWith({ tenants: '*', revealPii: true })
  })

  it('omits revealPii for a caller without data:read_pii, and sends their tenants', async () => {
    const { token } = await tokenFor('operator', {
      permissions: ['destinations:manage', 'data:read'],
      scope: [{ tenantId: 'acme', verticals: ['crm'] }],
    })
    await req('GET', '/api/destinations/dest-1', token)
    expect(client.getDestination).toHaveBeenCalledWith(
      { tenants: ['acme'], tenantVerticals: { acme: ['crm'] } },
      'dest-1',
    )
  })

  it('adds maskFinancial when data_access.mask_financial is on', async () => {
    await settings.set('data_access.mask_financial', true, null)
    const { token } = await tokenFor('admin')
    await req('GET', '/api/destinations', token)
    expect(client.listDestinations).toHaveBeenCalledWith({
      tenants: '*',
      revealPii: true,
      maskFinancial: true,
    })
  })
})

describe('writes', () => {
  it('creates with the caller as actor and audits without secrets', async () => {
    const { id, token } = await tokenFor('admin')
    const res = await req('POST', '/api/destinations', token, CREATE)
    expect(res.statusCode).toBe(201)
    expect(res.json().data.secretFieldsSet).toEqual(['accessKeyId', 'secretAccessKey'])
    const [, body] = client.createDestination.mock.calls[0]!
    expect(body).toMatchObject({ ...CREATE, actor: id })

    const audit = await auditDetails('destination.create')
    expect(audit).toHaveLength(1)
    expect(audit[0]!.row).toMatchObject({ user_id: id, target_id: 'dest-1' })
    expect(audit[0]!.detail).toEqual({
      destinationId: 'dest-1',
      name: 'Lake',
      type: 's3',
      includePii: false,
      tenants: ['acme'],
    })
    expect(audit[0]!.row.detail).not.toContain(SECRET)
  })

  it('refuses includePii without data:read_pii before calling upstream', async () => {
    const { token } = await tokenFor('operator', { permissions: ['destinations:manage'] })
    const res = await req('POST', '/api/destinations', token, { ...CREATE, includePii: true })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('PII_NOT_PERMITTED')
    expect(client.createDestination).not.toHaveBeenCalled()
    expect(await auditDetails('destination.create')).toHaveLength(0)
  })

  it('patches and records which settings changed', async () => {
    const { token } = await tokenFor('admin')
    const res = await req('PATCH', '/api/destinations/dest-1', token, { intervalSec: 600 })
    expect(res.statusCode).toBe(200)
    const [detail] = await auditDetails('destination.update')
    expect(detail!.detail).toEqual({
      destinationId: 'dest-1',
      name: 'Lake',
      fields: ['intervalSec'],
      includePii: false,
    })
  })

  it('rotates credentials, recording field names only', async () => {
    const { token } = await tokenFor('admin')
    const res = await req('PUT', '/api/destinations/dest-1/credentials', token, {
      secrets: { accessKeyId: 'AKIAEXAMPLE', secretAccessKey: SECRET },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain(SECRET)
    const [detail] = await auditDetails('destination.credentials_rotate')
    expect(detail!.detail).toEqual({
      destinationId: 'dest-1',
      secretFields: ['accessKeyId', 'secretAccessKey'],
    })
    expect(detail!.row.detail).not.toContain(SECRET)
    expect(detail!.row.detail).not.toContain('AKIAEXAMPLE')
  })

  it('deletes, auditing the name read first', async () => {
    const { token } = await tokenFor('admin')
    const res = await req('DELETE', '/api/destinations/dest-1', token)
    expect(res.statusCode).toBe(204)
    expect(client.deleteDestination).toHaveBeenCalledTimes(1)
    const [detail] = await auditDetails('destination.delete')
    expect(detail!.detail).toEqual({ destinationId: 'dest-1', name: 'Lake' })
  })

  it('runs, tests and backfills, auditing each', async () => {
    const { id, token } = await tokenFor('admin')
    const run = await req('POST', '/api/destinations/dest-1/run', token, {})
    expect(run.statusCode).toBe(202)
    expect(run.json().data.runId).toBe('run-1')
    const test = await req('POST', '/api/destinations/dest-1/test', token, {})
    expect(test.json().data).toEqual({ ok: true, latencyMs: 12 })
    const bf = await req('POST', '/api/destinations/dest-1/backfill', token, { vertical: 'crm' })
    expect(bf.json().data).toEqual({ cursorsReset: 2, runId: 'run-2' })
    const [, , bfBody] = client.backfillDestination.mock.calls[0]!
    expect(bfBody).toEqual({ vertical: 'crm', actor: id })

    expect((await auditDetails('destination.run'))[0]!.detail).toEqual({
      destinationId: 'dest-1',
      runId: 'run-1',
    })
    expect((await auditDetails('destination.test'))[0]!.detail).toEqual({
      destinationId: 'dest-1',
      ok: true,
    })
    expect((await auditDetails('destination.backfill'))[0]!.detail).toEqual({
      destinationId: 'dest-1',
      vertical: 'crm',
      resourceType: null,
      cursorsReset: 2,
      runId: 'run-2',
    })
  })

  it('lists runs with ISO timestamps and validates limit', async () => {
    const { token } = await tokenFor('admin')
    const res = await req('GET', '/api/destinations/dest-1/runs?limit=5', token)
    expect(res.statusCode).toBe(200)
    expect(res.json().data[0]).toMatchObject({
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:04.000Z',
    })
    expect(client.listDestinationRuns.mock.calls[0]![2]).toBe(5)
    const bad = await req('GET', '/api/destinations/dest-1/runs?limit=0', token)
    expect(bad.statusCode).toBe(400)
  })
})

describe('upstream refusals', () => {
  it('pass through with their status and code, and write no audit row', async () => {
    const { token } = await tokenFor('admin')
    client.createDestination.mockRejectedValueOnce(
      upstreamError(403, 'SCOPE_EXCEEDS_CALLER', "The destination's scope reaches outside yours."),
    )
    const scoped = await req('POST', '/api/destinations', token, CREATE)
    expect(scoped.statusCode).toBe(403)
    expect(scoped.json().error.code).toBe('SCOPE_EXCEEDS_CALLER')

    client.createDestination.mockRejectedValueOnce(
      upstreamError(400, 'HOST_NOT_ALLOWED', 'Private host.'),
    )
    const host = await req('POST', '/api/destinations', token, CREATE)
    expect(host.statusCode).toBe(400)
    expect(host.json().error.code).toBe('HOST_NOT_ALLOWED')

    client.listDestinations.mockRejectedValueOnce(
      upstreamError(409, 'DATA_STORE_DISABLED', 'The data store is off.'),
    )
    const off = await req('GET', '/api/destinations', token)
    expect(off.statusCode).toBe(409)
    expect(off.json().error.code).toBe('DATA_STORE_DISABLED')

    client.runDestination.mockRejectedValueOnce(
      upstreamError(409, 'RUN_IN_PROGRESS', 'A run is in progress.'),
    )
    const busy = await req('POST', '/api/destinations/dest-1/run', token, {})
    expect(busy.statusCode).toBe(409)
    expect(busy.json().error.code).toBe('RUN_IN_PROGRESS')

    client.getDestination.mockRejectedValueOnce(
      upstreamError(404, 'DESTINATION_NOT_FOUND', 'No such destination.'),
    )
    const gone = await req('DELETE', '/api/destinations/dest-9', token)
    expect(gone.statusCode).toBe(404)
    expect(client.deleteDestination).not.toHaveBeenCalled()

    expect(await auditDetails('destination.create')).toHaveLength(0)
    expect(await auditDetails('destination.run')).toHaveLength(0)
    expect(await auditDetails('destination.delete')).toHaveLength(0)
  })
})
