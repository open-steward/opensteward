/**
 * Destinations: the list with status and last run, gating by
 * `destinations:manage` (page and nav), the create form generated from the
 * type catalog's JSON Schema (secret fields write-only, experimental badge,
 * reserved types not offered, include-PII only for `data:read_pii`), the
 * scope picker limited to a restricted user's tenants, the create post's
 * typed body, upstream refusals re-rendered without echoing secrets, and the
 * detail page's actions (confirm on backfill and delete) and run history.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'

const mockGetMyAccess = vi.fn()
const mockListTenants = vi.fn()
const mockListDestinationTypes = vi.fn()
const mockListDestinations = vi.fn()
const mockGetDestination = vi.fn()
const mockCreateDestination = vi.fn()
const mockListDestinationRuns = vi.fn()
const mockRunDestination = vi.fn()
const mockTestDestination = vi.fn()
const mockDeleteDestination = vi.fn()
const mockBackfillDestination = vi.fn()
const mockRotateDestinationCredentials = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getMyAccess: mockGetMyAccess,
      listTenants: mockListTenants,
      listDestinationTypes: mockListDestinationTypes,
      listDestinations: mockListDestinations,
      getDestination: mockGetDestination,
      createDestination: mockCreateDestination,
      listDestinationRuns: mockListDestinationRuns,
      runDestination: mockRunDestination,
      testDestination: mockTestDestination,
      deleteDestination: mockDeleteDestination,
      backfillDestination: mockBackfillDestination,
      rotateDestinationCredentials: mockRotateDestinationCredentials,
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'destinations-journey-session-secret-long-enough'
const SECRET = 'wJalrXUtnFEMI-K7MDENG-bPxRfiCYEXAMPLEKEY'
let fastify: FastifyInstance
let seq = 0

const MANAGER = ['connections:read', 'data:read', 'destinations:manage']
const MANAGER_PII = [...MANAGER, 'data:read_pii']

const TYPES = [
  {
    type: 's3',
    label: 'Amazon S3 (and S3-compatible)',
    kind: 'object_store',
    available: true,
    configSchema: {
      type: 'object',
      properties: {
        bucket: { type: 'string', description: 'Bucket name.' },
        region: { type: 'string', default: 'us-east-1' },
        forcePathStyle: { type: 'boolean', default: false, description: 'Path-style URLs.' },
        compression: { type: 'string', enum: ['zstd', 'snappy', 'none'], default: 'zstd' },
        partSize: { type: 'integer', minimum: 1 },
      },
      required: ['bucket'],
    },
    secretsSchema: {
      type: 'object',
      properties: {
        accessKeyId: { type: 'string', description: 'Access key id.' },
        secretAccessKey: { type: 'string', description: 'Secret access key.' },
      },
    },
    secretFields: ['accessKeyId', 'secretAccessKey'],
  },
  {
    type: 'iceberg',
    label: 'Apache Iceberg',
    kind: 'loader',
    available: true,
    experimental: true,
    configSchema: { type: 'object', properties: { catalogUrl: { type: 'string' } } },
    secretsSchema: { type: 'object', properties: {} },
    secretFields: [],
  },
  {
    type: 'snowflake',
    label: 'Snowflake',
    kind: 'loader',
    available: true,
    experimental: false,
    configSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Account identifier.' },
        stage: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['s3', 'gcs', 'azure'] },
            url: { type: 'string', description: 'Staging location.' },
            region: { type: 'string' },
          },
          required: ['type', 'url'],
        },
      },
      required: ['account', 'stage'],
    },
    secretsSchema: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        privateKey: { type: 'string' },
        stageAccessKeyId: { type: 'string', description: 'S3 stage: access key id.' },
        stageSecretAccessKey: { type: 'string' },
      },
      required: ['username'],
    },
    secretFields: ['username', 'privateKey', 'stageAccessKeyId', 'stageSecretAccessKey'],
  },
  {
    type: 'future',
    label: 'Future warehouse',
    kind: 'loader',
    available: false,
    configSchema: null,
    secretsSchema: null,
    secretFields: [],
  },
]

const DEST = {
  id: 'dest-1',
  name: 'Lake prod',
  type: 's3',
  config: { bucket: 'lake', region: 'eu-west-1', prefix: 'os/' },
  secretFieldsSet: ['accessKeyId', 'secretAccessKey'],
  includePii: false,
  piiApprovedBy: null,
  scope: { tenants: ['acme'], verticals: { crm: '*' } },
  intervalSec: 3600,
  enabled: true,
  createdBy: 'u1',
  createdAt: '2026-09-29T12:00:00.000Z',
  updatedAt: '2026-09-29T12:00:00.000Z',
  lastRunAt: '2026-09-29T13:00:00.000Z',
  lastStatus: 'failed',
  lastError: 'AccessDenied: bucket policy',
}

function session(role: 'viewer' | 'operator' | 'admin') {
  seq += 1
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: role, role, token: `jwt-${seq}` }))
}
function access(permissions: string[], scope: unknown = { mode: 'all', grants: [] }) {
  mockGetMyAccess.mockResolvedValue({ roleId: 'r', roleName: 'r', permissions, scope })
}
function get(url: string, role: 'viewer' | 'operator' | 'admin' = 'operator') {
  return fastify.inject({ method: 'GET', url, cookies: { session: session(role) } })
}
function post(
  url: string,
  body: Record<string, string | string[]>,
  role: 'operator' | 'admin' = 'operator',
) {
  const c = session(role)
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
    mockListDestinationTypes,
    mockListDestinations,
    mockGetDestination,
    mockCreateDestination,
    mockListDestinationRuns,
    mockRunDestination,
    mockTestDestination,
    mockDeleteDestination,
    mockBackfillDestination,
    mockRotateDestinationCredentials,
  ]) {
    m.mockReset()
  }
  mockListTenants.mockResolvedValue([
    { id: 'acme', name: 'Acme' },
    { id: 'globex', name: 'Globex' },
  ])
  mockListDestinationTypes.mockResolvedValue(TYPES)
  mockListDestinations.mockResolvedValue([DEST])
  mockGetDestination.mockResolvedValue(DEST)
  mockCreateDestination.mockImplementation(async (_t: string, body: { name: string }) => ({
    ...DEST,
    name: body.name,
  }))
  mockListDestinationRuns.mockResolvedValue([
    {
      id: 'run-1',
      destinationId: 'dest-1',
      trigger: 'manual',
      status: 'success',
      startedAt: '2026-09-29T12:00:00.000Z',
      finishedAt: '2026-09-29T12:00:04.000Z',
      rowsWritten: 1250,
      deletesWritten: 3,
      files: [{ path: 'vertical=crm/resource_type=contacts/a.parquet', kind: 'rows', rows: 1250 }],
      error: null,
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

describe('list and gating', () => {
  it('lists destinations with status and last run, under a strict CSP', async () => {
    access(MANAGER)
    const res = await get('/destinations')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('href="/destinations"')
    expect(res.body).toContain('Lake prod')
    expect(res.body).toContain('Amazon S3 (and S3-compatible)')
    expect(res.body).toContain('acme · crm')
    expect(res.body).toContain('every 1 hour')
    expect(res.body).toContain('badge--danger">failed')
    expect(res.body).toContain('AccessDenied: bucket policy')
    expect(String(res.headers['content-security-policy'])).toContain("script-src 'self'")
    expect(res.body).not.toMatch(/\sonclick="/)
  })

  it('refuses a user without destinations:manage and hides the nav item', async () => {
    access(['connections:read', 'data:read'])
    const res = await get('/destinations')
    expect(res.statusCode).toBe(403)
    expect(res.body).toContain('destinations:manage')
    expect(mockListDestinations).not.toHaveBeenCalled()
    const other = await get('/connections')
    expect(other.body).not.toContain('href="/destinations"')
  })

  it('explains passthrough mode instead of listing', async () => {
    access(MANAGER)
    mockListDestinations.mockRejectedValue(
      Object.assign(new Error('409'), {
        response: { status: 409, data: { error: { code: 'DATA_STORE_DISABLED', message: 'off' } } },
      }),
    )
    const res = await get('/destinations')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('DATA_STORE_MODE=passthrough')
  })
})

describe('create form', () => {
  it('renders inputs from the JSON Schema with write-only secrets', async () => {
    access(MANAGER)
    const res = await get('/destinations/new?type=s3')
    expect(res.statusCode).toBe(200)
    const body = res.body
    expect(body).toMatch(/name="cfg_bucket"[^>]*required/)
    expect(body).toMatch(/type="checkbox" name="cfg_forcePathStyle"/)
    expect(body).toMatch(/<select class="select" name="cfg_compression">/)
    expect(body).toContain('<option value="zstd" selected>zstd</option>')
    expect(body).toMatch(/type="number" name="cfg_partSize"/)
    expect(body).toMatch(/name="cfg_region" value="us-east-1"/)
    expect(body).toMatch(
      /type="password" name="sec_secretAccessKey" value="" autocomplete="new-password"/,
    )
    // Experimental types carry a badge; reserved ones are listed, not offered.
    expect(body).toContain('data-experimental')
    expect(body).toContain('coming soon')
    expect(body).not.toContain('href="/destinations/new?type=future"')
    // No data:read_pii → no include-PII control.
    expect(body).not.toContain('name="include_pii"')
    // Unrestricted → may export every tenant.
    expect(body).toContain('name="tenant_mode" value="all"')
  })

  it('renders nested objects as fieldsets and maps dotted names back to nested JSON', async () => {
    access(MANAGER)
    const res = await get('/destinations/new?type=snowflake')
    const body = res.body
    expect(body).toContain('data-fieldset="stage"')
    expect(body).toMatch(/<select class="select" name="cfg_stage.type">/)
    expect(body).toMatch(/name="cfg_stage.url"[^>]*required/)
    expect(body).toContain('data-fieldset="stage-credentials"')
    expect(body).toMatch(/type="password" name="sec_stageSecretAccessKey" value=""/)
    expect(body).toMatch(/<textarea[^>]*name="sec_privateKey"/)

    await post('/destinations', {
      type: 'snowflake',
      name: 'Warehouse',
      tenant_mode: 'all',
      cfg_account: 'org-acct',
      'cfg_stage.type': 's3',
      'cfg_stage.url': 's3://stage/os/',
      'cfg_stage.region': '',
      sec_username: 'LOADER',
      sec_stageAccessKeyId: 'AKIAEXAMPLE',
      sec_stageSecretAccessKey: SECRET,
    })
    const [, created] = mockCreateDestination.mock.calls[0]!
    expect(created).toMatchObject({
      type: 'snowflake',
      config: { account: 'org-acct', stage: { type: 's3', url: 's3://stage/os/' } },
      secrets: {
        username: 'LOADER',
        stageAccessKeyId: 'AKIAEXAMPLE',
        stageSecretAccessKey: SECRET,
      },
    })
  })

  it('offers include-PII to a data:read_pii holder', async () => {
    access(MANAGER_PII)
    const res = await get('/destinations/new')
    expect(res.body).toContain('name="include_pii"')
  })

  it('limits a restricted user to their own tenants', async () => {
    access(MANAGER, { mode: 'restricted', grants: [{ tenantId: 'acme', verticals: '*' }] })
    mockListTenants.mockResolvedValue([{ id: 'acme', name: 'Acme' }])
    const res = await get('/destinations/new')
    expect(res.body).not.toContain('name="tenant_mode" value="all"')
    expect(res.body).toContain('name="tenants" value="acme"')
    expect(res.body).not.toContain('value="globex"')
  })

  it('posts a typed body and redirects to the new destination', async () => {
    access(MANAGER_PII)
    const res = await post('/destinations', {
      type: 's3',
      name: 'Lake prod',
      interval_min: '30',
      enabled: 'on',
      cfg_bucket: 'lake',
      cfg_region: '',
      cfg_compression: 'snappy',
      cfg_partSize: '8',
      sec_accessKeyId: 'AKIAEXAMPLE',
      sec_secretAccessKey: SECRET,
      tenant_mode: 'some',
      tenants: ['acme', 'globex'],
      verticals: ['crm', 'ecommerce'],
      include_pii: 'on',
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/destinations/dest-1')
    const [, body] = mockCreateDestination.mock.calls[0]!
    expect(body).toEqual({
      name: 'Lake prod',
      type: 's3',
      config: { bucket: 'lake', forcePathStyle: false, compression: 'snappy', partSize: 8 },
      secrets: { accessKeyId: 'AKIAEXAMPLE', secretAccessKey: SECRET },
      scope: { tenants: ['acme', 'globex'], verticals: { crm: '*', ecommerce: '*' } },
      includePii: true,
      enabled: true,
      intervalSec: 1800,
    })
  })

  it('never sends includePii for a user without data:read_pii', async () => {
    access(MANAGER)
    await post('/destinations', {
      type: 's3',
      name: 'x',
      cfg_bucket: 'lake',
      tenant_mode: 'all',
      include_pii: 'on',
    })
    expect(mockCreateDestination.mock.calls[0]![1]).toMatchObject({
      includePii: false,
      scope: { tenants: '*' },
    })
  })

  it('re-renders an upstream refusal without echoing secrets', async () => {
    access(MANAGER)
    mockCreateDestination.mockRejectedValue(
      Object.assign(new Error('403'), {
        response: {
          status: 403,
          data: {
            error: {
              code: 'SCOPE_EXCEEDS_CALLER',
              message: "The destination's scope reaches outside yours.",
            },
          },
        },
      }),
    )
    const res = await post('/destinations', {
      type: 's3',
      name: 'Lake prod',
      cfg_bucket: 'lake',
      sec_secretAccessKey: SECRET,
      tenant_mode: 'all',
    })
    expect(res.statusCode).toBe(403)
    expect(res.body).toContain('SCOPE_EXCEEDS_CALLER')
    expect(res.body).toMatch(/name="cfg_bucket" value="lake"/)
    expect(res.body).not.toContain(SECRET)
  })

  it('refuses a form with no tenant picked, before calling admin-api', async () => {
    access(MANAGER)
    const res = await post('/destinations', {
      type: 's3',
      name: 'x',
      cfg_bucket: 'lake',
      tenant_mode: 'some',
    })
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('Pick at least one tenant')
    expect(mockCreateDestination).not.toHaveBeenCalled()
  })
})

describe('detail', () => {
  it('shows settings, actions with confirmations, and run history', async () => {
    access(MANAGER)
    const res = await get('/destinations/dest-1')
    expect(res.statusCode).toBe(200)
    const body = res.body
    expect(body).toContain('action="/destinations/dest-1/test"')
    expect(body).toContain('action="/destinations/dest-1/run"')
    expect(body).toMatch(
      /action="\/destinations\/dest-1\/backfill"[^>]*data-backfill-form\s+data-confirm=/,
    )
    expect(body).toMatch(
      /action="\/destinations\/dest-1\/delete"[^>]*data-delete-form\s+data-confirm=/,
    )
    expect(body).toMatch(/type="password" name="sec_accessKeyId" value=""/)
    expect(body).toContain('vertical=crm/resource_type=contacts/a.parquet')
    expect(body).toContain('1,250')
    expect(body).toContain('The last run failed.')
    expect(body).toContain('<option value="crm">CRM</option>')
    expect(body).not.toContain('<option value="payments">')
  })

  it('answers 404 for an unknown or out-of-scope destination', async () => {
    access(MANAGER)
    mockGetDestination.mockResolvedValue(null)
    const res = await get('/destinations/nope')
    expect(res.statusCode).toBe(404)
  })

  it('runs, tests, backfills and deletes with a toast', async () => {
    access(MANAGER)
    mockRunDestination.mockResolvedValue({ runId: 'run-9' })
    const run = await post('/destinations/dest-1/run', {})
    expect(run.statusCode).toBe(302)
    expect(run.headers.location).toBe('/destinations/dest-1')

    mockTestDestination.mockResolvedValue({ ok: false, error: 'AccessDenied', latencyMs: 40 })
    const test = await post('/destinations/dest-1/test', {})
    expect(test.statusCode).toBe(302)
    expect(String(test.headers['set-cookie'])).toContain('os_flash')

    mockBackfillDestination.mockResolvedValue({ cursorsReset: 1, runId: null })
    await post('/destinations/dest-1/backfill', { vertical: 'crm', resource_type: 'contacts' })
    expect(mockBackfillDestination.mock.calls[0]![2]).toEqual({
      vertical: 'crm',
      resourceType: 'contacts',
    })

    mockDeleteDestination.mockResolvedValue(undefined)
    const del = await post('/destinations/dest-1/delete', {})
    expect(del.headers.location).toBe('/destinations')
  })

  it('rotates credentials with only the fields filled in', async () => {
    access(MANAGER)
    mockRotateDestinationCredentials.mockResolvedValue({
      ...DEST,
      secretFieldsSet: ['secretAccessKey'],
    })
    const res = await post('/destinations/dest-1/credentials', {
      sec_accessKeyId: '',
      sec_secretAccessKey: SECRET,
    })
    expect(res.statusCode).toBe(302)
    expect(mockRotateDestinationCredentials.mock.calls[0]![2]).toEqual({ secretAccessKey: SECRET })
  })
})
