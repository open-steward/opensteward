/**
 * Membrain reads against the documented REST API v2
 * (https://www.membrain.com/developers/api-documentation, fetched 2026-09-25):
 *
 *   Entry Point: "https://*.membrain.com/API/v2/"
 *   Authentication: "you may instead pass the APIKey in a Request Header
 *   named APIKey."
 *   Paging: "a paged collection with a maximum of 1000 entries per page
 *   (default is 100 per page) ... supply ?From=N in the query to access
 *   entries starting from index N ... Any paged collection will be contained
 *   in a root node which contains: count, from & to. ... When to matches
 *   count you are at the end of the paged set. To get to the next page, you
 *   can simply pass to in your next request."
 *
 * The fake honours only each list's documented query parameters (From;
 * SortBy on contacts, companies and activities; IncludeRetired on contacts;
 * Type on activities) and serves 100-row pages, since no page-size parameter
 * is documented.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  _resetRowPager,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { MembrainAdapter } from '../../../../../../src/verticals/crm/adapters/membrain/index'
import { ContactSchema } from '../../../../../../src/verticals/crm/schema/contact'
import { CompanySchema } from '../../../../../../src/verticals/crm/schema/company'
import { DealSchema } from '../../../../../../src/verticals/crm/schema/deal'
import { ActivitySchema } from '../../../../../../src/verticals/crm/schema/activity'
import { NoteSchema } from '../../../../../../src/verticals/crm/schema/note'
import { PipelineSchema } from '../../../../../../src/verticals/crm/schema/pipeline'
import {
  DOC_APPOINTMENT,
  DOC_COMPANY,
  DOC_CONTACT,
  DOC_NOTE,
  DOC_OPPORTUNITY,
  DOC_SALES_PROCESS,
  DOC_TASK,
} from './fixtures/docs'

const CREDS: Credentials = { accessToken: 'mb-key', extra: { subdomain: 'acme' } }
const BASE = 'https://acme.membrain.com/API/v2'
const UPSTREAM = 100

interface Seen {
  url: URL
  headers: Record<string, string>
}

let seen: Seen[] = []

/** Rows of each paged collection the fake serves. */
let collections: Record<string, Record<string, unknown>[]> = {}
let byId: Record<string, unknown> = {}
let salesProcesses: unknown[] = []

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const DOCUMENTED_QUERY: Record<string, Set<string>> = {
  '/contacts/': new Set(['From', 'IncludeRetired', 'SortBy']),
  '/companies/': new Set(['From', 'SortBy']),
  '/opportunities/': new Set(['From']),
  '/activities/': new Set(['From', 'Type', 'SortBy']),
}

function fake(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input.toString())
  seen.push({ url, headers: { ...(init?.headers as Record<string, string>) } })
  if (!url.href.startsWith(BASE)) return Promise.resolve(json({ error: 'Instance not found' }))
  const path = url.pathname.slice('/API/v2'.length)
  if (path === '/salesProcesses/') return Promise.resolve(json(salesProcesses))
  const allowed = DOCUMENTED_QUERY[path]
  if (allowed) {
    for (const k of url.searchParams.keys()) {
      if (!allowed.has(k)) return Promise.resolve(json({ error: `undocumented ${k}` }, 400))
    }
    let rows = collections[path] ?? []
    const type = url.searchParams.get('Type')
    if (type) rows = rows.filter((r) => r['Type'] === type)
    const from = Number(url.searchParams.get('From') ?? 0)
    const items = rows.slice(from, from + UPSTREAM)
    return Promise.resolve(
      json({
        count: String(rows.length),
        from: String(from),
        to: String(from + items.length),
        items,
      }),
    )
  }
  if (path in byId) return Promise.resolve(json(byId[path]))
  return Promise.resolve(json({ error: 'not found' }, 404))
}

function rowsOf(base: Record<string, unknown>, n: number, extra: Record<string, unknown> = {}) {
  return Array.from({ length: n }, (_, i) => ({ ...base, ...extra, Id: `id-${i}` }))
}

async function walk<T extends { id: string }>(
  call: (p: QueryParams) => Promise<T[]>,
  limit: number,
): Promise<{ ids: string[]; hasMore: (boolean | undefined)[] }> {
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  for (let page = 1; page <= 50; page++) {
    const params = withPageSink({ page, limit })
    const rows = await call(params)
    ids.push(...rows.map((r) => r.id))
    const meta = readUpstreamPage(params)
    hasMore.push(meta?.hasMore)
    if (!meta?.hasMore) break
  }
  return { ids, hasMore }
}

const adapter = new MembrainAdapter()

beforeEach(() => {
  _resetRowPager()
  seen = []
  collections = {}
  byId = {}
  salesProcesses = []
  vi.stubGlobal('fetch', vi.fn(fake))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('membrain connection', () => {
  it('sends the key in the APIKey header to the instance host, never in the URL', async () => {
    collections['/contacts/'] = [DOC_CONTACT]
    await adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(seen).toHaveLength(1)
    expect(seen[0].url.origin + seen[0].url.pathname).toBe(`${BASE}/contacts/`)
    expect(seen[0].headers['APIKey']).toBe('mb-key')
    expect(seen[0].url.href).not.toContain('mb-key')
  })

  it.each([
    ['no subdomain', { accessToken: 'k' }],
    [
      'a subdomain that is not one DNS label',
      { accessToken: 'k', extra: { subdomain: 'evil.com/x' } },
    ],
  ])('refuses with 501 and sends nothing when the connection has %s', async (_n, creds) => {
    await expect(
      adapter.listContacts(creds as Credentials, { page: 1, limit: 10 }),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    await expect(
      adapter.listPipelines(creds as Credentials, { page: 1, limit: 10 }),
    ).rejects.toMatchObject({
      statusCode: 501,
    })
    expect(seen).toHaveLength(0)
  })

  it('stores the instance subdomain on connect', async () => {
    const creds = await adapter.exchangeCredentials({ apiKey: ' k ', subdomain: ' acme ' })
    expect(creds).toEqual({ accessToken: 'k', extra: { subdomain: 'acme' } })
    expect(adapter.credentialFields().map((f) => f.name)).toEqual(['apiKey', 'subdomain'])
  })
})

describe.each([
  ['listContacts', '/contacts/', DOC_CONTACT, ContactSchema],
  ['listCompanies', '/companies/', DOC_COMPANY, CompanySchema],
  ['listDeals', '/opportunities/', DOC_OPPORTUNITY, DealSchema],
  ['listActivities', '/activities/', DOC_TASK, ActivitySchema],
] as const)('membrain %s paging', (method, path, doc, schema) => {
  const call = (p: QueryParams) =>
    (adapter[method] as (c: Credentials, p: QueryParams) => Promise<{ id: string }[]>).call(
      adapter,
      CREDS,
      p,
    )

  it.each([70, 150])(
    'walks N = 2L+1 rows at limit %i, each id once, hasMore exact',
    async (limit) => {
      const n = 2 * limit + 1
      collections[path] = rowsOf(doc as Record<string, unknown>, n)
      const { ids, hasMore } = await walk(call, limit)
      expect(ids).toEqual(Array.from({ length: n }, (_, i) => `id-${i}`))
      expect(hasMore).toEqual([true, true, false])
      // Upstream pages of 100 (the last one uneven), each fetched once.
      const froms = seen.map((s) => s.url.searchParams.get('From'))
      expect(froms).toEqual(
        Array.from({ length: Math.ceil(n / UPSTREAM) }, (_, i) => String(i * UPSTREAM)),
      )
      for (const s of seen) expect(s.url.pathname).toBe(`/API/v2${path}`)
    },
  )

  it('serves a far page from the right rows', async () => {
    collections[path] = rowsOf(doc as Record<string, unknown>, 250)
    const rows = await call(withPageSink({ page: 3, limit: 50 }))
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 50 }, (_, i) => `id-${100 + i}`))
  })

  it('returns rows that parse with the canonical schema', async () => {
    collections[path] = [doc as Record<string, unknown>]
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await call(params)
    expect(rows).toHaveLength(1)
    expect(() => schema.parse(rows[0])).not.toThrow()
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('an empty collection is one request and no rows', async () => {
    collections[path] = []
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await call(params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(seen).toHaveLength(1)
  })
})

describe('membrain list query', () => {
  // "the following options are available 'CreatedDate ASC', ..." (contacts,
  // companies, activities); GET /opportunities/ documents no SortBy.
  it.each([
    ['listContacts', { IncludeRetired: 'true', SortBy: 'CreatedDate ASC', From: '0' }],
    ['listCompanies', { SortBy: 'CreatedDate ASC', From: '0' }],
    ['listDeals', { From: '0' }],
    ['listActivities', { SortBy: 'CreatedDate ASC', From: '0' }],
    ['listNotes', { Type: 'Note', SortBy: 'CreatedDate ASC', From: '0' }],
  ] as const)('%s sends exactly %o', async (method, query) => {
    const fn = adapter[method] as (c: Credentials, p: QueryParams) => Promise<unknown[]>
    await fn.call(adapter, CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(seen).toHaveLength(1)
    expect(Object.fromEntries(seen[0].url.searchParams)).toEqual(query)
  })
})

describe('membrain listNotes', () => {
  it('lists activities of Type Note only', async () => {
    collections['/activities/'] = [
      ...rowsOf(DOC_NOTE, 3).map((r, i) => ({ ...r, Id: `note-${i}` })),
      DOC_TASK,
      DOC_APPOINTMENT,
    ]
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await adapter.listNotes(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['note-0', 'note-1', 'note-2'])
    for (const r of rows) NoteSchema.parse(r)
    expect(seen[0].url.searchParams.get('Type')).toBe('Note')
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('walks N = 2L+1 notes, each once', async () => {
    collections['/activities/'] = rowsOf(DOC_NOTE, 121)
    const { ids, hasMore } = await walk((p) => adapter.listNotes(CREDS, p), 60)
    expect(ids).toEqual(Array.from({ length: 121 }, (_, i) => `id-${i}`))
    expect(hasMore).toEqual([true, true, false])
  })

  it('getNote reads GET /activities/{Id} and refuses an activity that is not a Note', async () => {
    byId[`/activities/${DOC_NOTE.Id}`] = DOC_NOTE
    byId[`/activities/${DOC_TASK.Id}`] = DOC_TASK
    expect((await adapter.getNote(CREDS, DOC_NOTE.Id)).content).toBe(DOC_NOTE.Contents)
    await expect(adapter.getNote(CREDS, DOC_TASK.Id)).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('membrain listPipelines', () => {
  it('reads GET /salesProcesses/ once and slices it locally', async () => {
    salesProcesses = rowsOf(DOC_SALES_PROCESS, 5)
    const pages: string[][] = []
    const more: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 2 })
      const rows = await adapter.listPipelines(CREDS, params)
      for (const r of rows) PipelineSchema.parse(r)
      pages.push(rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(pages).toEqual([['id-0', 'id-1'], ['id-2', 'id-3'], ['id-4']])
    expect(more).toEqual([true, true, false])
    for (const s of seen) {
      expect(s.url.href).toBe(`${BASE}/salesProcesses/`)
    }
  })

  it('surfaces an upstream error instead of an empty list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(json({ error: 'nope' }, 404))),
    )
    await expect(adapter.listPipelines(CREDS, { page: 1, limit: 10 })).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('getPipeline finds the id in the list (no by-id path is documented)', async () => {
    salesProcesses = [DOC_SALES_PROCESS]
    expect((await adapter.getPipeline(CREDS, DOC_SALES_PROCESS.Id)).name).toBe('Sales Process')
    await expect(adapter.getPipeline(CREDS, 'missing')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('membrain get by id', () => {
  it.each([
    ['getContact', '/contacts/', DOC_CONTACT, ContactSchema],
    ['getCompany', '/companies/', DOC_COMPANY, CompanySchema],
    ['getDeal', '/opportunities/', DOC_OPPORTUNITY, DealSchema],
    ['getActivity', '/activities/', DOC_TASK, ActivitySchema],
  ] as const)('%s reads GET %s{Id}', async (method, path, doc, schema) => {
    byId[`${path}${doc.Id}`] = doc
    const fn = adapter[method] as (c: Credentials, id: string) => Promise<{ id: string }>
    const out = await fn.call(adapter, CREDS, doc.Id)
    expect(out.id).toBe(doc.Id)
    schema.parse(out)
    expect(seen[0].url.href).toBe(`${BASE}${path}${doc.Id}`)
    expect(seen[0].headers['APIKey']).toBe('mb-key')
  })
})

describe('membrain off-contract bodies', () => {
  // Read as an empty last page, these would tell a sync the collection is
  // complete; they throw instead.
  it.each([
    ['no root node', {}],
    ['a root node without items', { count: '0', from: '0', to: '0' }],
    ['items without a count', { from: '0', to: '0', items: [] }],
    ['a blank count', { count: '', from: '0', to: '0', items: [] }],
  ])('listContacts throws 502 on a 200 body with %s', async (_n, body) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(json(body))),
    )
    await expect(
      adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 502 })
  })

  it('listPipelines throws 502 on a 200 body that is not an array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(json({ items: [] }))),
    )
    await expect(adapter.listPipelines(CREDS, { page: 1, limit: 10 })).rejects.toMatchObject({
      statusCode: 502,
    })
  })
})

describe('membrain error bodies', () => {
  // A live probe of an unknown instance (2026-09-23, recorded in the paging
  // triage) answered HTTP 200 with {"error": "Instance not found"}.
  it.each([
    ['listContacts', () => adapter.listContacts(CREDS, { page: 1, limit: 10 })],
    ['listPipelines', () => adapter.listPipelines(CREDS, { page: 1, limit: 10 })],
    ['getDeal', () => adapter.getDeal(CREDS, DOC_OPPORTUNITY.Id)],
  ])('%s throws on a 200 body that names an error', async (_n, call) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(json({ error: 'Instance not found' }))),
    )
    await expect(call()).rejects.toThrow(/Instance not found/)
  })
})
