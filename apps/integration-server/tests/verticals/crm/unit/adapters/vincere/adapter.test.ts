/**
 * Vincere's reads, against a fake that honours only what the spec says.
 *
 * Source: Vincere's first-party OpenAPI spec, https://api.vincere.io/vapi.yaml.
 *
 * - Host `https://{tenant}.vincere.io/api/v2`; every request carries
 *   `id-token` and `x-api-key`.
 * - `GET /candidate|company|position/search/{matrix_vars}`, where
 *   `matrix_vars` is a required path segment ("fl=id,name,first_name;...;sort=id
 *   desc,created_date asc") and the query takes `q`, `fq`, `start` ("From the
 *   set of matched results, return record numbers start from. Default to 0"),
 *   `limit` ("Default to 25, max limit is 100.") and `language`. It answers
 *   `{ category, result: { start, total, items } }`, and "Only the fields that
 *   have value will be return". "As of 12.11.0, start param is limited to
 *   10000."
 * - `POST /activities?index=N`: "Each call returns a slice of maximum 25
 *   activities. Each slice has its index and a field to indicate if it is the
 *   last slice." `index` "must be less than 400".
 * - `GET /candidate/{id}`, `/company/{id}`, `/position/{id}`, `/activities/{id}`.
 *
 * The fake rejects any other host, path, method, header set or query key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetRowPager,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { VincereAdapter } from '../../../../../../src/verticals/crm/adapters/vincere'
import { ContactSchema } from '../../../../../../src/verticals/crm/schema/contact'
import { CompanySchema } from '../../../../../../src/verticals/crm/schema/company'
import { DealSchema } from '../../../../../../src/verticals/crm/schema/deal'
import { ActivitySchema } from '../../../../../../src/verticals/crm/schema/activity'
import {
  DOC_ACTIVITIES_SLICE,
  DOC_ACTIVITY,
  DOC_CANDIDATE,
  DOC_CANDIDATE_SEARCH_ITEMS,
  DOC_COMPANY,
  DOC_COMPANY_SEARCH_ITEMS,
  DOC_POSITION,
  DOC_POSITION_SEARCH_ITEMS,
} from './fixtures/documented'

const BASE = 'https://acme.vincere.io/api/v2'
const CREDS: Credentials = {
  accessToken: 'access',
  refreshToken: 'refresh',
  extra: { domain: 'acme', apiKey: 'key-123', idToken: 'id-tok' },
}
const SLICE = 25

type Entity = 'candidate' | 'company' | 'position'
const TEMPLATE: Record<Entity, Record<string, unknown>> = {
  candidate: DOC_CANDIDATE_SEARCH_ITEMS[3] as Record<string, unknown>,
  company: DOC_COMPANY_SEARCH_ITEMS[1] as Record<string, unknown>,
  position: DOC_POSITION_SEARCH_ITEMS[0] as Record<string, unknown>,
}
const SEARCH_KEYS = new Set(['q', 'fq', 'start', 'limit', 'language'])

let counts: Partial<Record<Entity | 'activities', number>> = {}
let calls: Array<{ method: string; url: URL; body?: unknown }> = []
let omitLast = false

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function rowsOf(entity: Entity): Array<Record<string, unknown>> {
  return Array.from({ length: counts[entity] ?? 0 }, (_, i) => ({
    ...TEMPLATE[entity],
    id: 1000 + i,
  }))
}

async function fakeVincere(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input))
  const method = init?.method ?? 'GET'
  calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
  if (url.origin !== 'https://acme.vincere.io' || !url.pathname.startsWith('/api/v2/'))
    return json(404, { message: 'no such host or path' })
  const headers = new Headers(init?.headers)
  if (headers.get('id-token') !== 'id-tok' || headers.get('x-api-key') !== 'key-123')
    return json(401, { message: 'Unauthorized' })
  const path = decodeURIComponent(url.pathname.slice('/api/v2'.length))

  const search = /^\/(candidate|company|position)\/search\/(.+)$/.exec(path)
  if (search && method === 'GET') {
    const entity = search[1] as Entity
    const matrix = search[2]!
    const m = /^fl=([a-z_,]+);sort=id asc$/.exec(matrix)
    if (!m) return json(400, { message: `bad matrix vars ${matrix}` })
    for (const k of url.searchParams.keys())
      if (!SEARCH_KEYS.has(k)) return json(400, { message: `unknown query ${k}` })
    const start = Number(url.searchParams.get('start') ?? 0)
    const limit = Number(url.searchParams.get('limit') ?? 25)
    if (limit > 100) return json(400, { message: 'max limit is 100' })
    if (start > 10_000) return json(400, { message: 'start param is limited to 10000' })
    const fl = m[1]!.split(',')
    const all = rowsOf(entity)
    const items = all
      .slice(start, start + limit)
      .map((r) =>
        Object.fromEntries(Object.entries(r).filter(([k, v]) => fl.includes(k) && v != null)),
      )
    return json(200, {
      category: entity === 'position' ? 'job' : entity,
      result: { start, total: all.length, items },
    })
  }

  if (path === '/activities' && method === 'POST') {
    for (const k of url.searchParams.keys())
      if (k !== 'index') return json(400, { message: `unknown query ${k}` })
    if (!url.searchParams.has('index')) return json(400, { message: 'index is required' })
    const index = Number(url.searchParams.get('index'))
    if (index >= 400) return json(400, { message: 'index must be less than 400' })
    const n = counts.activities ?? 0
    const lo = index * SLICE
    const content = Array.from({ length: Math.max(0, Math.min(SLICE, n - lo)) }, (_, i) => ({
      ...DOC_ACTIVITIES_SLICE.content[0],
      id: 5000 + lo + i,
    }))
    const last = lo + SLICE >= n
    return json(200, {
      slice_index: index,
      num_of_elements: content.length,
      ...(omitLast ? {} : { last }),
      content,
    })
  }

  // POST /company and PUT /company/{id} answer only the documented
  // company_post_res / company_id_put_res example, `{ "id": 11234 }`.
  if (path === '/company' && method === 'POST') return json(200, { id: 11234 })
  const put = /^\/company\/(\d+)$/.exec(path)
  if (put && method === 'PUT') return json(200, { id: Number(put[1]) })

  if (method === 'GET') {
    if (/^\/candidate\/\d+$/.test(path)) return json(200, DOC_CANDIDATE)
    if (/^\/company\/\d+$/.test(path)) return json(200, DOC_COMPANY)
    if (/^\/position\/\d+$/.test(path)) return json(200, DOC_POSITION)
    if (/^\/activities\/\d+$/.test(path)) return json(200, DOC_ACTIVITY)
  }
  return json(404, { message: `no ${method} ${path}` })
}

let adapter: VincereAdapter

beforeEach(() => {
  _resetRowPager()
  counts = {}
  calls = []
  omitLast = false
  adapter = new VincereAdapter()
  vi.stubGlobal('fetch', vi.fn(fakeVincere))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function page(p: number, limit: number): QueryParams {
  return withPageSink({ page: p, limit })
}

const SEARCHES = [
  {
    name: 'listContacts',
    entity: 'candidate' as const,
    fl: 'id,name,first_name,last_name,primary_email,phone,mobile,current_job_title,current_employer_obj,created_date,last_update',
    call: (params: QueryParams) => adapter.listContacts(CREDS, params),
    schema: ContactSchema,
  },
  {
    name: 'listCompanies',
    entity: 'company' as const,
    fl: 'id,name,website,phone,industry,created_date,last_update',
    call: (params: QueryParams) => adapter.listCompanies(CREDS, params),
    schema: CompanySchema,
  },
  {
    name: 'listDeals',
    entity: 'position' as const,
    fl: 'id,job_title,job_status,company_id,closed_date,forecast_annual_fee,forecast_annual_fee_currency,created_date,last_update',
    call: (params: QueryParams) => adapter.listDeals(CREDS, params),
    schema: DealSchema,
  },
]

describe.each(SEARCHES)('vincere $name', ({ entity, fl, call, schema }) => {
  it('walks every row once over GET /<entity>/search/{matrix_vars}, hasMore exact', async () => {
    const L = 7
    counts[entity] = 2 * L + 1
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let p = 1; p <= 3; p++) {
      const params = page(p, L)
      const rows = await call(params)
      for (const r of rows) {
        schema.parse(r)
        seen.push(r.id)
      }
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(2 * L + 1)
    }
    expect(seen).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => String(1000 + i)))
    expect(more).toEqual([true, true, false])
    expect(calls).toHaveLength(3)
    for (const [i, c] of calls.entries()) {
      expect(c.method).toBe('GET')
      expect(decodeURIComponent(c.url.pathname)).toBe(
        `/api/v2/${entity}/search/fl=${fl};sort=id asc`,
      )
      expect(Object.fromEntries(c.url.searchParams)).toEqual({
        start: String(i * L),
        limit: String(L),
      })
    }
  })

  it('clamps the page size to 100 and reports it', async () => {
    counts[entity] = 150
    const params = page(1, 250)
    const rows = await call(params)
    expect(rows).toHaveLength(100)
    expect(calls[0]!.url.searchParams.get('limit')).toBe('100')
    expect(readUpstreamPage(params)).toMatchObject({
      pageSize: 100,
      hasMore: true,
      totalCount: 150,
    })
  })

  it('refuses a page whose start is past 10000, sending nothing', async () => {
    counts[entity] = 20_000
    await expect(call(page(102, 100))).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toHaveLength(0)
  })

  it('serves the page that starts at 10000', async () => {
    counts[entity] = 10_050
    const rows = await call(page(101, 100))
    expect(rows).toHaveLength(50)
    expect(calls[0]!.url.searchParams.get('start')).toBe('10000')
  })
})

describe('vincere listActivities (POST /activities)', () => {
  it('cuts the caller pages out of 25-row slices: every id once, hasMore exact', async () => {
    const L = 20
    counts.activities = 2 * L + 1 // slices of 25 and 16
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let p = 1; p <= 3; p++) {
      const params = page(p, L)
      const rows = await adapter.listActivities(CREDS, params)
      for (const r of rows) {
        ActivitySchema.parse(r)
        seen.push(r.id)
      }
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => String(5000 + i)))
    expect(more).toEqual([true, true, false])
    for (const c of calls) {
      expect(c.method).toBe('POST')
      expect(c.url.pathname).toBe('/api/v2/activities')
      expect(c.body).toEqual({})
    }
    expect(calls.map((c) => c.url.searchParams.get('index'))).toEqual(['0', '1'])
  })

  it('refuses a page past slice 399 with 501', async () => {
    counts.activities = 400 * SLICE + 10
    await expect(adapter.listActivities(CREDS, page(101, 100))).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls.every((c) => Number(c.url.searchParams.get('index')) < 400)).toBe(true)
  })

  it('throws instead of guessing the end when a slice lacks `last`', async () => {
    counts.activities = 3
    omitLast = true
    await expect(adapter.listActivities(CREDS, page(1, 10))).rejects.toThrow(
      /did not say whether it is the last/,
    )
  })

  it("keeps each connection's walk apart (row pager keyed by connectionScope)", async () => {
    const L = 20
    counts.activities = 2 * L + 1
    await adapter.listActivities(CREDS, page(1, L))
    expect(calls.map((c) => c.url.searchParams.get('index'))).toEqual(['0'])
    calls = []
    // A second connection to the same tenant must fetch its own slices,
    // never be handed the first connection's buffered rows.
    const other: Credentials = { ...CREDS, refreshToken: 'refresh-2' }
    const rows = await adapter.listActivities(other, page(2, L))
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: L }, (_, i) => String(5000 + L + i)))
    expect(calls.map((c) => c.url.searchParams.get('index'))).toEqual(['0', '1'])
  })

  it('ends on an empty slice that omits `last`', async () => {
    counts.activities = 0
    omitLast = true
    const params = page(1, 10)
    expect(await adapter.listActivities(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('vincere get* read back over the documented detail paths', () => {
  it('getContact → GET /candidate/{id}', async () => {
    const c = ContactSchema.parse(await adapter.getContact(CREDS, '9999'))
    expect(c.id).toBe('9999')
    expect(calls[0]!.url.pathname).toBe('/api/v2/candidate/9999')
  })

  it('getCompany → GET /company/{id}', async () => {
    const c = CompanySchema.parse(await adapter.getCompany(CREDS, '1111'))
    expect(c.name).toBe('Google')
    expect(calls[0]!.url.pathname).toBe('/api/v2/company/1111')
  })

  it('getDeal → GET /position/{id}', async () => {
    const d = DealSchema.parse(await adapter.getDeal(CREDS, '169615'))
    expect(d.title).toBe('Hourly One Day Placement')
    expect(calls[0]!.url.pathname).toBe('/api/v2/position/169615')
  })

  it('getActivity → GET /activities/{id}', async () => {
    const a = ActivitySchema.parse(await adapter.getActivity(CREDS, '9999'))
    expect(a.id).toBe('9999')
    expect(calls[0]!.url.pathname).toBe('/api/v2/activities/9999')
  })
})

describe('vincere company writes read the record back', () => {
  // The spec's POST /company and PUT /company/{id} answer only
  // `{ "id": 11234 }` ("Company ID."), so the company comes from GET /company/{id}.
  it('createCompany posts, then reads GET /company/{id} for the returned id', async () => {
    const c = CompanySchema.parse(await adapter.createCompany(CREDS, { name: 'Google' }))
    expect(calls.map((x) => `${x.method} ${x.url.pathname}`)).toEqual([
      'POST /api/v2/company',
      'GET /api/v2/company/11234',
    ])
    expect(c).toMatchObject({ id: '1111', name: 'Google' })
    expect(c.metadata).toEqual(DOC_COMPANY)
  })

  it('updateCompany puts, then reads GET /company/{id}', async () => {
    const c = CompanySchema.parse(await adapter.updateCompany(CREDS, '1111', { name: 'Google' }))
    expect(calls.map((x) => `${x.method} ${x.url.pathname}`)).toEqual([
      'PUT /api/v2/company/1111',
      'GET /api/v2/company/1111',
    ])
    expect(c.metadata).toEqual(DOC_COMPANY)
  })
})

describe('vincere refuses what it cannot serve, before sending anything', () => {
  it.each([
    ['listPipelines', () => adapter.listPipelines(CREDS, page(1, 10))],
    ['getPipeline', () => adapter.getPipeline(CREDS, '1')],
    ['listNotes', () => adapter.listNotes(CREDS, page(1, 10))],
    ['getNote', () => adapter.getNote(CREDS, '1')],
  ])('%s throws 501 NOT_SUPPORTED', async (_name, run) => {
    await expect(run()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toHaveLength(0)
  })

  it('needs the tenant domain and the api key', async () => {
    await expect(
      adapter.listContacts({ accessToken: 'a', extra: { apiKey: 'key-123' } }, page(1, 10)),
    ).rejects.toThrow(/extra\.domain is required/)
    await expect(
      adapter.listContacts({ accessToken: 'a', extra: { domain: 'acme' } }, page(1, 10)),
    ).rejects.toThrow(/extra\.apiKey is required/)
    expect(calls).toHaveLength(0)
  })
})

describe('vincere capabilities', () => {
  it('declares the search maximum, "max limit is 100"', () => {
    expect(adapter.capabilities.maxPageSize).toBe(100)
  })
})

describe('vincere base URL', () => {
  it('is the tenant host', async () => {
    counts.candidate = 1
    await adapter.listContacts(CREDS, page(1, 10))
    expect(calls[0]!.url.href.startsWith(`${BASE}/candidate/search/`)).toBe(true)
  })
})
