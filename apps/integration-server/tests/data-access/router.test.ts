/**
 * `/admin/data/*` — the internal data-access surface the admin data viewer
 * reads through admin-api. Pins: the admin guard, the scope re-check against
 * `owner_tenant_id` (404 out of scope, NULL owner only for '*'), masking by
 * the vertical's classification, PII reveal needing BOTH the scope and
 * `?reveal=pii`, filters limited to searchable fields, the passthrough 409,
 * and the streamed export.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  CredentialStore,
  ResourceStore,
  openDb,
  type DbHandle,
  REDACTED,
} from '@opensteward/shared'
import { createDataAccessRouter, csvCell, DATA_SCOPE_HEADER } from '../../src/data-access/router'

const SECRET = 'a'.repeat(40)
const ADMIN = 'test-admin-secret'
const OLD_ADMIN = process.env['ADMIN_SECRET']

let app: FastifyInstance
let handle: DbHandle
let creds: CredentialStore
let resources: ResourceStore
let connA: string // tenant-a, crm/hubspot
let connB: string // tenant-b, crm/hubspot
let connNull: string // no owner tenant, accounting/fortnox

const ALL = { tenants: '*' as const }
const TENANT_A = { tenants: ['tenant-a'] }

async function build(withStore = true) {
  app = Fastify({ logger: false })
  await app.register(
    createDataAccessRouter({
      credentialStore: creds,
      resourceStore: withStore ? resources : undefined,
      storeSecret: SECRET,
    }),
  )
  await app.ready()
}

/** `scope: null` sends no scope at all. */
function get(url: string, scope: unknown = ALL, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'GET',
    url,
    headers: {
      'x-admin-secret': ADMIN,
      ...(scope === null ? {} : { [DATA_SCOPE_HEADER]: JSON.stringify(scope) }),
      ...headers,
    },
  })
}

beforeEach(async () => {
  process.env['ADMIN_SECRET'] = ADMIN
  handle = await openDb({ sqlitePath: ':memory:' })
  creds = await CredentialStore.create(handle, SECRET)
  resources = await ResourceStore.create(handle)
  const c = { accessToken: 'x' } as never
  connA = await creds.create('hubspot', null, c, 'A', 'crm', 'tenant-a')
  connB = await creds.create('hubspot', null, c, 'B', 'crm', 'tenant-b')
  connNull = await creds.create('fortnox', null, c, 'N', 'accounting', null)
  await resources.upsertMany('crm', 'hubspot', connA, 'contacts', [
    {
      id: 'ct1',
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      phone: '+46701234567',
      title: 'CFO',
      address: { line1: 'Main 1', city: 'Oslo', country: 'NO' },
      metadata: { secret: 'upstream' },
    },
    { id: 'ct2', first_name: 'Bob', email: 'bob@example.com', title: 'CEO' },
  ] as Array<{ id: string } & Record<string, unknown>>)
  await resources.upsert('crm', 'hubspot', connA, 'deals', 'd1', {
    id: 'd1',
    title: 'Big deal',
    value: { amount: 1000, currency: 'EUR' },
  })
  await resources.markCollectionComplete('crm', 'hubspot', connA, 'contacts')
  await resources.upsert('crm', 'hubspot', connB, 'contacts', 'other', { id: 'other' })
  await resources.upsert('accounting', 'fortnox', connNull, 'invoices', 'i1', {
    id: 'i1',
    totalAmount: 99,
    notes: 'call Jane',
  })
})

afterEach(async () => {
  await app?.close()
  await handle.close()
  if (OLD_ADMIN === undefined) delete process.env['ADMIN_SECRET']
  else process.env['ADMIN_SECRET'] = OLD_ADMIN
})

describe('guard and scope', () => {
  it('requires the admin secret', async () => {
    await build()
    const res = await get('/admin/data/summary', ALL, { 'x-admin-secret': 'wrong' })
    expect(res.statusCode).toBe(403)
  })

  it('requires a well-formed scope', async () => {
    await build()
    expect((await get('/admin/data/summary', null)).json().error.code).toBe('INVALID_SCOPE')
    const bad = await app.inject({
      method: 'GET',
      url: '/admin/data/summary',
      headers: { 'x-admin-secret': ADMIN, [DATA_SCOPE_HEADER]: '{nope' },
    })
    expect(bad.statusCode).toBe(400)
    expect((await get('/admin/data/summary', { tenants: 'some' })).statusCode).toBe(400)
  })

  it('accepts the scope as a query parameter too', async () => {
    await build()
    const res = await get(
      `/admin/data/summary?scope=${encodeURIComponent(JSON.stringify(TENANT_A))}`,
      null,
    )
    expect(res.statusCode).toBe(200)
  })

  it('answers 409 DATA_STORE_DISABLED in passthrough mode', async () => {
    await build(false)
    const res = await get('/admin/data/summary')
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('DATA_STORE_DISABLED')
  })
})

describe('GET /admin/data/summary', () => {
  it('narrows a tenant to the verticals granted in it (tenantVerticals)', async () => {
    await build()
    const crmOnly = await get('/admin/data/summary', {
      tenants: ['tenant-a'],
      tenantVerticals: { 'tenant-a': ['crm'] },
    })
    expect(crmOnly.json().data.map((c: { connectionId: string }) => c.connectionId)).toEqual([
      connA,
    ])
    const accountingOnly = await get('/admin/data/summary', {
      tenants: ['tenant-a'],
      tenantVerticals: { 'tenant-a': ['accounting'] },
    })
    expect(accountingOnly.json().data).toEqual([])
    const record = await get(`/admin/data/connections/${connA}/resources/contacts/ct1`, {
      tenants: ['tenant-a'],
      tenantVerticals: { 'tenant-a': ['accounting'] },
    })
    expect(record.statusCode).toBe(404)
  })

  it("'*' sees every connection, including ones with no owner tenant", async () => {
    await build()
    const res = await get('/admin/data/summary')
    expect(res.statusCode).toBe(200)
    const data = res.json().data as Array<{
      connectionId: string
      resources: Array<{ resourceType: string; count: number }>
    }>
    expect(data.map((d) => d.connectionId).sort()).toEqual([connA, connB, connNull].sort())
    const a = data.find((d) => d.connectionId === connA)!
    expect(a).toMatchObject({
      vertical: 'crm',
      platform: 'hubspot',
      label: 'A',
      ownerTenantId: 'tenant-a',
    })
    const contacts = a.resources.find((r) => r.resourceType === 'contacts')!
    expect(contacts).toMatchObject({ count: 2, classified: true })
    expect(typeof (contacts as unknown as { latestChangedAt: number }).latestChangedAt).toBe(
      'number',
    )
    expect(
      (contacts as unknown as { collectionCompletedAt: number }).collectionCompletedAt,
    ).toBeGreaterThan(0)
  })

  it('a tenant scope sees only its own connections; NULL-owner rows are hidden', async () => {
    await build()
    const data = (await get('/admin/data/summary', TENANT_A)).json().data as Array<{
      connectionId: string
    }>
    expect(data.map((d) => d.connectionId)).toEqual([connA])
  })

  it('a vertical scope narrows connections and resource types', async () => {
    await build()
    const data = (
      await get('/admin/data/summary', { tenants: '*', verticals: { crm: ['deals'] } })
    ).json().data as Array<{ connectionId: string; resources: Array<{ resourceType: string }> }>
    expect(data.map((d) => d.connectionId).sort()).toEqual([connA, connB].sort())
    expect(
      data.find((d) => d.connectionId === connA)!.resources.map((r) => r.resourceType),
    ).toEqual(['deals'])
  })
})

describe('GET /admin/data/schema/:vertical/:type', () => {
  it('lists fields with class and searchability for this scope', async () => {
    await build()
    const res = await get('/admin/data/schema/crm/contacts')
    expect(res.statusCode).toBe(200)
    const fields = res.json().data.fields as Array<{
      path: string
      class: string
      searchable: boolean
    }>
    const email = fields.find((f) => f.path === 'email')!
    expect(email).toMatchObject({ class: 'pii', searchable: false })
    expect(fields.find((f) => f.path === 'title')).toMatchObject({
      class: 'internal',
      searchable: true,
    })
    const revealed = (
      await get('/admin/data/schema/crm/contacts', { ...ALL, revealPii: true })
    ).json().data.fields as Array<{ path: string; searchable: boolean }>
    expect(revealed.find((f) => f.path === 'email')!.searchable).toBe(true)
  })

  it('404s an unknown or out-of-scope type', async () => {
    await build()
    expect((await get('/admin/data/schema/crm/nope')).statusCode).toBe(404)
    expect((await get('/admin/data/schema/nope/contacts')).statusCode).toBe(404)
    expect(
      (
        await get('/admin/data/schema/crm/contacts', {
          tenants: '*',
          verticals: { crm: ['deals'] },
        })
      ).statusCode,
    ).toBe(404)
  })
})

describe('GET /admin/data/connections/:id/resources/:type', () => {
  it('masks pii and the upstream payload by default', async () => {
    await build()
    const res = await get(
      `/admin/data/connections/${connA}/resources/contacts?sort=resource_id&dir=asc`,
    )
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.meta).toMatchObject({
      total: 2,
      totalCapped: false,
      piiRevealed: false,
      nextCursor: null,
    })
    const ct1 = body.data[0]
    expect(ct1.id).toBe('ct1')
    expect(ct1.connectionId).toBe(connA)
    expect(ct1.data.email).toBe('j***@example.com')
    expect(ct1.data.first_name).toBe('J***')
    expect(ct1.data.phone).toBe('+*********67')
    expect(ct1.data.address).toEqual({ line1: '***', city: '***', country: 'NO' })
    expect(ct1.data.title).toBe('CFO')
    expect(ct1.data.metadata).toBe(REDACTED)
  })

  it('reveals pii only with scope.revealPii AND ?reveal=pii', async () => {
    await build()
    const url = `/admin/data/connections/${connA}/resources/contacts?sort=resource_id&dir=asc`
    expect((await get(url, { ...ALL, revealPii: true })).json().data[0].data.email).toBe(
      'j***@example.com',
    )
    expect((await get(`${url}&reveal=pii`, ALL)).json().data[0].data.email).toBe('j***@example.com')
    const res = (await get(`${url}&reveal=pii`, { ...ALL, revealPii: true })).json()
    expect(res.data[0].data.email).toBe('jane@example.com')
    expect(res.meta.piiRevealed).toBe(true)
  })

  it('masks financial fields only with scope.maskFinancial', async () => {
    await build()
    const url = `/admin/data/connections/${connA}/resources/deals`
    expect((await get(url)).json().data[0].data.value).toEqual({ amount: 1000, currency: 'EUR' })
    expect((await get(url, { ...ALL, maskFinancial: true })).json().data[0].data.value).toBe(
      REDACTED,
    )
  })

  it('paginates with an opaque cursor', async () => {
    await build()
    const base = `/admin/data/connections/${connA}/resources/contacts?sort=resource_id&dir=asc&limit=1`
    const p1 = (await get(base)).json()
    expect(p1.data.map((r: { id: string }) => r.id)).toEqual(['ct1'])
    const p2 = (await get(`${base}&cursor=${encodeURIComponent(p1.meta.nextCursor)}`)).json()
    expect(p2.data.map((r: { id: string }) => r.id)).toEqual(['ct2'])
    expect(p2.meta.nextCursor).toBeNull()
    const bad = await get(`${base}&cursor=garbage`)
    expect(bad.statusCode).toBe(400)
    expect(bad.json().error.code).toBe('INVALID_CURSOR')
  })

  it('filters on searchable fields; refuses pii filters without revealPii', async () => {
    await build()
    const url = (filters: unknown) =>
      `/admin/data/connections/${connA}/resources/contacts?filters=${encodeURIComponent(JSON.stringify(filters))}`
    const ok = await get(url([{ path: 'title', op: 'eq', value: 'CEO' }]))
    expect(ok.json().data.map((r: { id: string }) => r.id)).toEqual(['ct2'])
    const refused = await get(url([{ path: 'email', op: 'contains', value: 'jane' }]))
    expect(refused.statusCode).toBe(400)
    expect(refused.json().error.code).toBe('FIELD_NOT_SEARCHABLE')
    const nested = await get(url([{ path: 'metadata.secret', op: 'eq', value: 'upstream' }]))
    expect(nested.json().error.code).toBe('FIELD_NOT_SEARCHABLE')
    const allowed = await get(url([{ path: 'email', op: 'contains', value: 'jane' }]), {
      ...ALL,
      revealPii: true,
    })
    expect(allowed.json().data.map((r: { id: string }) => r.id)).toEqual(['ct1'])
    expect((await get(url([{ path: 'a..b', op: 'eq', value: 1 }]))).json().error.code).toBe(
      'INVALID_PATH',
    )
    expect((await get(url({ not: 'an array' }))).json().error.code).toBe('INVALID_QUERY')
  })

  it('free-text search never reads pii fields without revealPii', async () => {
    await build()
    const url = `/admin/data/connections/${connA}/resources/contacts?q=`
    expect((await get(`${url}cfo`)).json().data.map((r: { id: string }) => r.id)).toEqual(['ct1'])
    expect((await get(`${url}jane`)).json().data).toEqual([])
    expect(
      (await get(`${url}jane`, { ...ALL, revealPii: true }))
        .json()
        .data.map((r: { id: string }) => r.id),
    ).toEqual(['ct1'])
  })

  it('404s a connection outside the scope, unknown, or NULL-owner for a tenant scope', async () => {
    await build()
    expect(
      (await get(`/admin/data/connections/${connB}/resources/contacts`, TENANT_A)).statusCode,
    ).toBe(404)
    expect((await get(`/admin/data/connections/nope/resources/contacts`)).statusCode).toBe(404)
    expect(
      (await get(`/admin/data/connections/${connNull}/resources/invoices`, TENANT_A)).statusCode,
    ).toBe(404)
    expect(
      (await get(`/admin/data/connections/${connNull}/resources/invoices`)).json().data[0].data
        .notes,
    ).toBe(REDACTED)
  })

  it('an unclassified stored type is served fully masked (fail closed)', async () => {
    await resources.upsert('crm', 'hubspot', connA, 'mystery', 'm1', { id: 'm1', anything: 'x' })
    await build()
    const res = (await get(`/admin/data/connections/${connA}/resources/mystery`)).json()
    expect(res.meta.classified).toBe(false)
    expect(res.data[0].id).toBe('m1')
    expect(res.data[0].data).toEqual({ id: REDACTED, anything: REDACTED })
  })
})

describe('GET /admin/data/connections/:id/resources/:type/:rid', () => {
  it('returns one masked record and honours reveal only with the scope', async () => {
    await build()
    const url = `/admin/data/connections/${connA}/resources/contacts/ct1`
    const masked = await get(url)
    expect(masked.statusCode).toBe(200)
    expect(masked.headers['cache-control']).toBe('no-store')
    expect(masked.json().data.data.email).toBe('j***@example.com')
    expect((await get(`${url}?reveal=pii`)).json().data.data.email).toBe('j***@example.com')
    expect(
      (await get(`${url}?reveal=pii`, { ...ALL, revealPii: true })).json().data.data.email,
    ).toBe('jane@example.com')
    expect((await get(`/admin/data/connections/${connA}/resources/contacts/nope`)).statusCode).toBe(
      404,
    )
    expect((await get(url, { tenants: ['tenant-b'] })).statusCode).toBe(404)
  })
})

describe('GET /admin/data/connections/:id/resources/:type/export', () => {
  it('streams masked NDJSON', async () => {
    await build()
    const res = await get(
      `/admin/data/connections/${connA}/resources/contacts/export?format=ndjson&sort=resource_id&dir=asc`,
    )
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/x-ndjson')
    expect(res.headers['content-disposition']).toContain('attachment')
    const lines = res.body
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    expect(lines.map((l) => l.id)).toEqual(['ct1', 'ct2'])
    expect(lines[0].data.email).toBe('j***@example.com')
  })

  it('streams masked CSV with schema columns, across pages', async () => {
    await resources.upsertMany(
      'crm',
      'hubspot',
      connA,
      'contacts',
      Array.from({ length: 450 }, (_, i) => ({
        id: `bulk${String(i).padStart(3, '0')}`,
        title: '=cmd',
      })),
    )
    await build()
    const res = await get(`/admin/data/connections/${connA}/resources/contacts/export?format=csv`)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    const rows = res.body.trim().split('\r\n')
    expect(rows).toHaveLength(1 + 452)
    const header = rows[0]!.split(',')
    expect(header.slice(0, 4)).toEqual(['_id', '_connectionId', '_updatedAt', '_changedAt'])
    expect(header).toContain('email')
    expect(res.body).toContain('j***@example.com')
    expect(res.body).not.toContain('jane@example.com')
    // Formula injection is neutralised.
    expect(res.body).toContain("'=cmd")
  })

  it('rejects an unknown format and out-of-scope connections before streaming', async () => {
    await build()
    expect(
      (await get(`/admin/data/connections/${connA}/resources/contacts/export?format=xml`))
        .statusCode,
    ).toBe(400)
    expect(
      (await get(`/admin/data/connections/${connA}/resources/contacts/export`, { tenants: ['x'] }))
        .statusCode,
    ).toBe(404)
  })
})

describe('csvCell', () => {
  it('quotes and neutralises', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"')
    expect(csvCell(null)).toBe('')
  })
})
