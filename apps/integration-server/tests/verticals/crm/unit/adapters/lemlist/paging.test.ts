/**
 * lemlist's list endpoints page by `offset` + `limit`, except company notes,
 * which page by `page` + `limit`.
 *
 * GET /contacts
 * (https://developer.lemlist.com/api-reference/endpoints/contacts/get-many-contacts.md):
 * offset "Number of contacts to skip for pagination. Defaults to 0.", limit
 * "Maximum number of contacts to return (1–500). Defaults to 100.", 200 is
 * `{ data, total, limit, offset }`.
 *
 * GET /companies
 * (https://developer.lemlist.com/api-reference/endpoints/companies/get-many-companies.md):
 * offset "Number of companies to skip for pagination. Defaults to 0.", limit
 * "Number of companies to retrieve. Default: 100. Maximum: 500", 200 is
 * `{ data, total, limit, offset }`.
 *
 * GET /campaigns
 * (https://developer.lemlist.com/api-reference/endpoints/campaigns/get-many-campaigns.md):
 * offset "Offset from the start. For pagination.", limit "Number of campaigns
 * to retrieve. Default: 100. Maximum: 100.", 200 is a bare array.
 *
 * GET /activities?version=v2
 * (https://developer.lemlist.com/api-reference/endpoints/activities/get-many-activities.md):
 * offset "Number of records to skip. ... increment offset by the limit value
 * on each request", limit "Default: 100. Maximum: 100", 200 is a bare array.
 *
 * GET /companies/{companyId}/notes
 * (https://developer.lemlist.com/api-reference/endpoints/companies/get-company-notes.md):
 * page "Page number to retrieve", limit "Number of notes to retrieve.
 * Default: 100. Maximum: 100", 200 is `{ data, total }`.
 *
 * The adapter used to read `offset` from a param the router never sets, so
 * page 2 repeated page 1. The fake lemlist below honours only the documented
 * parameters, at the seam the adapter calls: global `fetch`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { LemlistAdapter } from '../../../../../../src/verticals/crm/adapters/lemlist'

const CREDS: Credentials = { accessToken: 'key-1' }

interface Sent {
  url: URL
}

let sent: Sent[] = []
const counts = { contacts: 0, companies: 0, campaigns: 0, activities: 0 }
/** Notes per company id; companies listed in this order. */
let notesByCompany: Array<[string, number]> = []

function pad(i: number): string {
  return String(i).padStart(4, '0')
}
function ids(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${pad(i + 1)}`)
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function intParam(url: URL, name: string, dflt: number): number {
  return url.searchParams.has(name) ? Number(url.searchParams.get(name)) : dflt
}

const PREFIX = { contacts: 'ct', companies: 'co', campaigns: 'cp', activities: 'ac' } as const
const MAX = { contacts: 500, companies: 500, campaigns: 100, activities: 100 } as const

function companyIds(): string[] {
  return counts.companies > 0 ? ids('co', counts.companies) : notesByCompany.map(([id]) => id)
}

/** A server-side cap on GET /companies below the documented 500. */
let companiesCap = 500

/**
 * The API key a request was sent with. Every key but `key-1` sees its own,
 * tiny account: 5 rows per collection, and notes only on `co1`.
 */
function apiKey(init?: RequestInit): string {
  const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? ''
  return atob(auth.replace(/^Basic /, '')).slice(1)
}
const OTHER_ACCOUNT_ROWS = 5

/** lemlist as documented: offset + limit, or page + limit on notes. */
async function fakeLemlist(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input))
  const method = init?.method ?? 'GET'
  sent.push({ url })
  if (method !== 'GET') return json(405, { message: 'GET only here' })
  const path = url.pathname.replace(/^\/api/, '')
  const key = apiKey(init)
  const other = key !== 'key-1'

  const notes = /^\/companies\/([^/]+)\/notes$/.exec(path)
  if (notes) {
    const id = decodeURIComponent(notes[1] as string)
    if (other) {
      const n = id === 'co1' ? OTHER_ACCOUNT_ROWS : 0
      const rows = ids(`${key}-${id}-n`, n)
      return json(200, { data: rows.map((_id) => ({ _id, companyId: id })), total: n })
    }
    const n = notesByCompany.find(([c]) => c === id)?.[1] ?? 0
    const limit = intParam(url, 'limit', 100)
    const page = intParam(url, 'page', 1)
    if (limit < 1 || limit > 100) return json(400, { message: 'limit must be 1..100' })
    const rows = ids(`${id}-n`, n).slice((page - 1) * limit, page * limit)
    return json(200, { data: rows.map((_id) => ({ _id, companyId: id })), total: n })
  }

  const coll = /^\/(contacts|companies|campaigns|activities)$/.exec(path)?.[1] as
    keyof typeof PREFIX | undefined
  if (!coll) return json(404, { message: `no route ${path}` })
  if (coll === 'activities' && url.searchParams.get('version') !== 'v2')
    return json(400, { message: 'version=v2 is mandatory' })
  const limit = intParam(url, 'limit', 100)
  const offset = intParam(url, 'offset', 0)
  if (limit < 1 || limit > MAX[coll]) return json(400, { message: `limit must be 1..${MAX[coll]}` })
  const all = other
    ? coll === 'companies'
      ? Array.from({ length: OTHER_ACCOUNT_ROWS }, (_, i) => `co${i + 1}`)
      : ids(`${key}-${PREFIX[coll]}`, OTHER_ACCOUNT_ROWS)
    : coll === 'companies'
      ? companyIds()
      : ids(PREFIX[coll], counts[coll])
  const served = coll === 'companies' ? Math.min(limit, companiesCap) : limit
  const rows = all.slice(offset, offset + served).map((_id) => ({ _id, name: _id }))
  if (coll === 'contacts' || coll === 'companies')
    return json(200, { data: rows, total: all.length, limit, offset })
  return json(200, rows)
}

beforeEach(() => {
  sent = []
  counts.contacts = 0
  counts.companies = 0
  counts.campaigns = 0
  counts.activities = 0
  notesByCompany = []
  companiesCap = 500
  _resetRowPager()
  vi.stubGlobal('fetch', vi.fn(fakeLemlist))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const adapter = new LemlistAdapter()

type ListMethod =
  'listContacts' | 'listCompanies' | 'listPipelines' | 'listActivities' | 'listNotes'

async function syncPage(
  method: ListMethod,
  page: number,
  limit: number,
  extra: Record<string, unknown> = {},
  creds: Credentials = CREDS,
): Promise<{ ids: string[]; hasMore: boolean | undefined }> {
  const params: QueryParams = withPageSink({ page, limit, ...extra })
  const rows = (await adapter[method](creds, params)) as Array<{ id: string }>
  return { ids: rows.map((r) => r.id), hasMore: readUpstreamPage(params)?.hasMore }
}

/** The page meta the adapter reported for one sync-worker page. */
async function pageMeta(
  method: ListMethod,
  page: number,
  limit: number,
  extra: Record<string, unknown> = {},
): Promise<ReturnType<typeof readUpstreamPage>> {
  const params: QueryParams = withPageSink({ page, limit, ...extra })
  await adapter[method](CREDS, params)
  return readUpstreamPage(params)
}

/** Walk like the sync worker: until a reported hasMore:false, or a short page. */
async function walk(
  method: ListMethod,
  limit: number,
  extra: Record<string, unknown> = {},
): Promise<string[]> {
  const out: string[] = []
  for (let page = 1; page < 1_000; page++) {
    const params: QueryParams = withPageSink({ page, limit, ...extra })
    const rows = (await adapter[method](CREDS, params)) as Array<{ id: string }>
    out.push(...rows.map((r) => r.id))
    const meta = readUpstreamPage(params)
    const size = meta?.pageSize ?? limit
    if (meta?.hasMore === false || (meta?.hasMore === undefined && rows.length < size)) return out
  }
  throw new Error('walk did not end')
}

const OFFSET_METHODS = [
  ['listContacts', 'contacts'],
  ['listCompanies', 'companies'],
  ['listPipelines', 'campaigns'],
  ['listActivities', 'activities'],
] as const

describe.each(OFFSET_METHODS)('lemlist %s pages by offset', (method, coll) => {
  const L = 10
  const all = (n: number): string[] => ids(PREFIX[coll], n)

  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order, hasMore exact', async () => {
    counts[coll] = 2 * L + 1
    const p1 = await syncPage(method, 1, L)
    const p2 = await syncPage(method, 2, L)
    const p3 = await syncPage(method, 3, L)
    expect(p1).toEqual({ ids: all(21).slice(0, 10), hasMore: true })
    expect(p2).toEqual({ ids: all(21).slice(10, 20), hasMore: true })
    expect(p3).toEqual({ ids: all(21).slice(20), hasMore: false })
  })

  it('sends the documented offset on page 2', async () => {
    counts[coll] = 2 * L + 1
    await syncPage(method, 2, L)
    for (const s of sent) expect(s.url.pathname).toBe(`/api/${coll}`)
    const asked = sent.map((s) => [
      s.url.searchParams.get('limit'),
      s.url.searchParams.get('offset'),
    ])
    expect(asked).toContainEqual([String(L), String(L)])
  })

  it('reports hasMore false when the rows end exactly on a page', async () => {
    counts[coll] = 2 * L
    expect(await syncPage(method, 2, L)).toEqual({ ids: all(20).slice(10), hasMore: false })
  })

  it('clamps a limit above the maximum and still serves every row', async () => {
    counts[coll] = 1_203
    expect(await walk(method, 700)).toEqual(all(1_203))
    for (const s of sent)
      expect(Number(s.url.searchParams.get('limit'))).toBeLessThanOrEqual(MAX[coll])
  })

  it('serves every row at the sync worker page size, min(500, declared max)', async () => {
    counts[coll] = 1_203
    expect(adapter.capabilities.maxPageSize).toBe(100)
    expect(await walk(method, Math.min(500, adapter.capabilities.maxPageSize))).toEqual(all(1_203))
  })

  it('gives meta.hasMore through parseListQuery then listPage', async () => {
    counts[coll] = 25
    const params2 = parseListQuery({ limit: '10', page: '2' }, adapter)
    const env2 = listPage<{ id: string }>(await adapter[method](CREDS, params2), params2, 'lemlist')
    expect(env2.data.map((r) => r.id)).toEqual(all(25).slice(10, 20))
    expect(env2.meta.hasMore).toBe(true)
    const params3 = parseListQuery({ limit: '10', page: '3' }, adapter)
    const env3 = listPage<{ id: string }>(await adapter[method](CREDS, params3), params3, 'lemlist')
    expect(env3.data.map((r) => r.id)).toEqual(all(25).slice(20))
    expect(env3.meta.hasMore).toBe(false)
  })
})

describe('lemlist listNotes with company_id pages by page number', () => {
  const L = 10
  const scoped = { company_id: 'coX' }
  const all = (n: number): string[] => ids('coX-n', n)

  it('serves 2L+1 notes over pages 1, 2, 3, each once, hasMore exact', async () => {
    notesByCompany = [['coX', 2 * L + 1]]
    const p1 = await syncPage('listNotes', 1, L, scoped)
    const p2 = await syncPage('listNotes', 2, L, scoped)
    const p3 = await syncPage('listNotes', 3, L, scoped)
    expect(p1).toEqual({ ids: all(21).slice(0, 10), hasMore: true })
    expect(p2).toEqual({ ids: all(21).slice(10, 20), hasMore: true })
    expect(p3).toEqual({ ids: all(21).slice(20), hasMore: false })
  })

  it('sends the documented page on page 2', async () => {
    notesByCompany = [['coX', 2 * L + 1]]
    await syncPage('listNotes', 2, L, scoped)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.url.pathname).toBe('/api/companies/coX/notes')
    expect(sent[0]!.url.searchParams.get('page')).toBe('2')
    expect(sent[0]!.url.searchParams.get('limit')).toBe(String(L))
  })

  it('clamps a limit above 100 and still serves every note', async () => {
    notesByCompany = [['coX', 1_203]]
    expect(await walk('listNotes', 250, scoped)).toEqual(all(1_203))
    for (const s of sent) expect(s.url.searchParams.get('limit')).toBe('100')
  })

  it('gives meta.hasMore through parseListQuery then listPage', async () => {
    notesByCompany = [['coX', 25]]
    const params2 = parseListQuery({ limit: '10', page: '2', company_id: 'coX' }, adapter)
    const env2 = listPage(await adapter.listNotes(CREDS, params2), params2, 'lemlist')
    expect(env2.data.map((r) => r.id)).toEqual(all(25).slice(10, 20))
    expect(env2.meta.hasMore).toBe(true)
    const params3 = parseListQuery({ limit: '10', page: '3', company_id: 'coX' }, adapter)
    const env3 = listPage(await adapter.listNotes(CREDS, params3), params3, 'lemlist')
    expect(env3.meta.hasMore).toBe(false)
  })
})

describe("lemlist listNotes without company_id walks companies, then each company's notes", () => {
  const L = 10

  function expected(): string[] {
    return notesByCompany.flatMap(([id, n]) => ids(`${id}-n`, n))
  }

  it('serves 2L+1 notes over pages 1, 2, 3, each once, hasMore exact', async () => {
    notesByCompany = [
      ['co1', 3],
      ['co2', 0],
      ['co3', 12],
      ['co4', 0],
      ['co5', 6],
    ]
    const all = expected()
    expect(all).toHaveLength(2 * L + 1)
    const p1 = await syncPage('listNotes', 1, L)
    const p2 = await syncPage('listNotes', 2, L)
    const p3 = await syncPage('listNotes', 3, L)
    expect(p1).toEqual({ ids: all.slice(0, 10), hasMore: true })
    expect(p2).toEqual({ ids: all.slice(10, 20), hasMore: true })
    expect(p3).toEqual({ ids: all.slice(20), hasMore: false })
  })

  it('reports hasMore false when the notes end exactly on a page', async () => {
    notesByCompany = [
      ['co1', 10],
      ['co2', 10],
      ['co3', 0],
    ]
    expect(await syncPage('listNotes', 2, L)).toEqual({
      ids: expected().slice(10),
      hasMore: false,
    })
  })

  it('walks a company past 100 notes with the documented page', async () => {
    notesByCompany = [
      ['co1', 150],
      ['co2', 5],
    ]
    expect(await walk('listNotes', L)).toEqual(expected())
    const notePages = sent
      .filter((s) => s.url.pathname === '/api/companies/co1/notes')
      .map((s) => [s.url.searchParams.get('page'), s.url.searchParams.get('limit')])
    expect(notePages).toEqual([
      ['1', '100'],
      ['2', '100'],
    ])
  })

  it('walks past the first batch of companies by offset', async () => {
    notesByCompany = Array.from({ length: 503 }, (_, i): [string, number] => [
      `co${pad(i + 1)}`,
      i % 50 === 0 ? 2 : 0,
    ])
    notesByCompany.push(['co9999', 1])
    const all = expected()
    expect(await walk('listNotes', 100)).toEqual(all)
    const companyOffsets = sent
      .filter((s) => s.url.pathname === '/api/companies')
      .map((s) => s.url.searchParams.get('offset'))
    expect(companyOffsets).toContain('500')
    for (const s of sent) expect(Number(s.url.searchParams.get('limit'))).toBeLessThanOrEqual(500)
  })

  it('gives meta.hasMore through parseListQuery then listPage', async () => {
    notesByCompany = [
      ['co1', 12],
      ['co2', 13],
    ]
    const all = expected()
    const params2 = parseListQuery({ limit: '10', page: '2' }, adapter)
    const env2 = listPage(await adapter.listNotes(CREDS, params2), params2, 'lemlist')
    expect(env2.data.map((r) => r.id)).toEqual(all.slice(10, 20))
    expect(env2.meta.hasMore).toBe(true)
    const params3 = parseListQuery({ limit: '10', page: '3' }, adapter)
    const env3 = listPage(await adapter.listNotes(CREDS, params3), params3, 'lemlist')
    expect(env3.data.map((r) => r.id)).toEqual(all.slice(20))
    expect(env3.meta.hasMore).toBe(false)
  })
})

describe('lemlist paging reports', () => {
  it('reports totalCount, and pageSize when a limit above 500 is clamped', async () => {
    counts.contacts = 1_203
    expect(await pageMeta('listContacts', 1, 700)).toEqual({
      totalCount: 1_203,
      hasMore: true,
      pageSize: 500,
    })
    counts.companies = 30
    expect(await pageMeta('listCompanies', 1, 10)).toEqual({ totalCount: 30, hasMore: true })
  })

  it('reports an exact end and totalCount on the company_id notes path', async () => {
    notesByCompany = [['coX', 20]]
    expect(await pageMeta('listNotes', 2, 10, { company_id: 'coX' })).toEqual({
      totalCount: 20,
      hasMore: false,
    })
    expect(await pageMeta('listNotes', 1, 250, { company_id: 'coX' })).toEqual({
      totalCount: 20,
      hasMore: false,
      pageSize: 100,
    })
  })
})

describe('lemlist row-pager keys are per connection', () => {
  const OTHER: Credentials = { accessToken: 'key-2' }

  it.each([
    ['listPipelines', 'campaigns'],
    ['listActivities', 'activities'],
  ] as const)("%s never serves one connection's rows to another", async (method, coll) => {
    counts[coll] = 25
    await syncPage(method, 1, 10)
    // key-2's account has only 5 rows: its page 2 is empty.
    expect(await syncPage(method, 2, 10, {}, OTHER)).toEqual({ ids: [], hasMore: false })
    expect(await syncPage(method, 1, 10, {}, OTHER)).toEqual({
      ids: ids(`key-2-${PREFIX[coll]}`, 5),
      hasMore: false,
    })
  })

  it("unscoped listNotes never serves one connection's notes to another", async () => {
    notesByCompany = [
      ['co1', 12],
      ['co2', 13],
    ]
    await syncPage('listNotes', 1, 10)
    expect(await syncPage('listNotes', 2, 10, {}, OTHER)).toEqual({ ids: [], hasMore: false })
    expect(await syncPage('listNotes', 1, 10, {}, OTHER)).toEqual({
      ids: ids('key-2-co1-n', 5),
      hasMore: false,
    })
  })
})

describe('lemlist upstream request budget (20 req / 2 s)', () => {
  it('does not fetch past a short bare-array page', async () => {
    counts.campaigns = 15
    expect(await walk('listPipelines', 10)).toEqual(ids('cp', 15))
    expect(sent.map((s) => s.url.searchParams.get('offset'))).toEqual(['0', '10'])
  })

  it('fetches GET /companies once when one batch holds every company', async () => {
    notesByCompany = [
      ['co1', 3],
      ['co2', 0],
      ['co3', 4],
    ]
    expect(await walk('listNotes', 10)).toHaveLength(7)
    expect(sent.filter((s) => s.url.pathname === '/api/companies')).toHaveLength(1)
  })

  it('advances the companies offset by the batch served, not the size asked', async () => {
    companiesCap = 300
    notesByCompany = Array.from({ length: 503 }, (_, i): [string, number] => [
      `co${pad(i + 1)}`,
      i % 50 === 0 ? 1 : 0,
    ])
    const all = notesByCompany.flatMap(([id, n]) => ids(`${id}-n`, n))
    expect(await walk('listNotes', 100)).toEqual(all)
    const offsets = sent
      .filter((s) => s.url.pathname === '/api/companies')
      .map((s) => s.url.searchParams.get('offset'))
    expect(offsets).toEqual(['0', '300'])
  })
})
