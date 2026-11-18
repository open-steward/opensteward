/**
 * HighLevel (LeadConnector) list paging, API Version 2021-07-28.
 *
 * Contacts: GET /contacts/
 * (https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/contacts/get-contacts)
 * documents `startAfterId`, `startAfter` and `limit`: "Limit Per Page records
 * count. will allow maximum up to 100 and default will be 20". The next keyset
 * comes back in `meta` (ContactsMetaSchema in GoHighLevel's own spec:
 * `meta.startAfterId`, `meta.startAfter`, `meta.nextPageUrl`).
 *
 * Deals: GET /opportunities/search
 * (https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/opportunities/search-opportunity)
 * documents `page` ("Page number for pagination") and the same `limit`, with
 * "Pagination metadata for the result set" in `meta` (`total`, `nextPage`,
 * `currentPage`).
 *
 * Pipelines: GET /opportunities/pipelines documents no paging parameters; it
 * returns every pipeline for the location, so the adapter pages locally.
 *
 * The adapter used to send only `limit`, so page 2 repeated page 1. The fake
 * below honours only the documented parameters, at the seam the adapter
 * calls: global `fetch`.
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
import { HighLevelAdapter } from '../../../../../../src/verticals/crm/adapters/highlevel'

const CREDS: Credentials = {
  accessToken: 'at-1',
  refreshToken: 'rt-1',
  extra: { locationId: 'loc-1' },
}
const MAX = 100

interface Sent {
  url: URL
}

let sent: Sent[] = []
let contactCount = 0
let dealCount = 0
let pipelineCount = 0
/** When set, contact rows carry the caller's token, so a row served to the wrong connection shows. */
let tagRows = false
/** Which of the documented end signals the opportunities meta carries. */
let dealMeta: 'full' | 'nextPageOnly' | 'totalOnly' | 'none' = 'full'

const pad = (i: number): string => String(i + 1).padStart(4, '0')
const contactIds = (n: number): string[] => Array.from({ length: n }, (_, i) => `c${pad(i)}`)
const dealIds = (n: number): string[] => Array.from({ length: n }, (_, i) => `d${pad(i)}`)
const pipelineIds = (n: number): string[] => Array.from({ length: n }, (_, i) => `p${pad(i)}`)

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function sizeOf(url: URL): number | Response {
  const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 20
  if (limit > MAX) return json(422, { message: 'limit must not be greater than 100' })
  return limit
}

/** HighLevel as documented, and nothing else. */
async function fakeHighLevel(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input))
  const method = init?.method ?? 'GET'
  sent.push({ url })
  if (method !== 'GET') return json(405, {})

  if (url.pathname === '/contacts/') {
    if (url.searchParams.get('locationId') !== 'loc-1') return json(422, {})
    const limit = sizeOf(url)
    if (typeof limit !== 'number') return limit
    const all = contactIds(contactCount).map((id, i) => ({ id, dateAdded: 1_000_000 + i }))
    let start = 0
    const afterId = url.searchParams.get('startAfterId')
    const after = url.searchParams.get('startAfter')
    if (afterId !== null || after !== null) {
      // The keyset is (dateAdded, id): both halves must be sent.
      if (afterId === null || after === null) return json(422, { message: 'half a keyset' })
      start = all.findIndex((c) => c.id === afterId && c.dateAdded === Number(after)) + 1
      if (start === 0) return json(422, { message: 'unknown keyset' })
    }
    const token = new Headers(init?.headers).get('Authorization')?.replace('Bearer ', '') ?? ''
    const page = all.slice(start, start + limit)
    const rows = tagRows ? page.map((c) => ({ ...c, id: `${token}:${c.id}` })) : page
    const last = page[page.length - 1]
    const more = start + limit < all.length
    return json(200, {
      contacts: rows,
      count: all.length,
      meta: {
        total: all.length,
        startAfterId: last?.id ?? null,
        startAfter: last?.dateAdded ?? null,
        nextPageUrl: more
          ? `https://services.leadconnectorhq.com/contacts/?locationId=loc-1&startAfter=${last!.dateAdded}&startAfterId=${last!.id}`
          : null,
      },
    })
  }

  if (url.pathname === '/opportunities/search') {
    if (url.searchParams.get('location_id') !== 'loc-1') return json(422, {})
    const limit = sizeOf(url)
    if (typeof limit !== 'number') return limit
    const page = url.searchParams.has('page') ? Number(url.searchParams.get('page')) : 1
    const all = dealIds(dealCount).map((id) => ({ id }))
    const rows = all.slice((page - 1) * limit, page * limit)
    const more = page * limit < all.length
    const meta = {
      full: { total: all.length, currentPage: page, nextPage: more ? page + 1 : null },
      nextPageOnly: { currentPage: page, nextPage: more ? page + 1 : null },
      totalOnly: { total: all.length, currentPage: page },
      none: undefined,
    }[dealMeta]
    return json(200, { opportunities: rows, ...(meta ? { meta } : {}) })
  }

  if (url.pathname === '/opportunities/pipelines/' || url.pathname === '/opportunities/pipelines') {
    if (url.searchParams.get('locationId') !== 'loc-1') return json(422, {})
    return json(200, { pipelines: pipelineIds(pipelineCount).map((id) => ({ id, stages: [] })) })
  }

  return json(404, { message: `no route ${url.pathname}` })
}

beforeEach(() => {
  sent = []
  contactCount = 0
  dealCount = 0
  pipelineCount = 0
  tagRows = false
  dealMeta = 'full'
  _resetRowPager()
  vi.stubGlobal('fetch', vi.fn(fakeHighLevel))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const adapter = new HighLevelAdapter()

type ListMethod = 'listContacts' | 'listDeals' | 'listPipelines'

async function syncPage(
  method: ListMethod,
  page: number,
  limit: number,
): Promise<{ ids: string[]; hasMore: boolean | undefined }> {
  const params: QueryParams = withPageSink({ page, limit })
  const rows = (await adapter[method](CREDS, params)) as Array<{ id: string }>
  return { ids: rows.map((r) => r.id), hasMore: readUpstreamPage(params)?.hasMore }
}

async function walk(method: ListMethod, limit: number): Promise<string[]> {
  const out: string[] = []
  for (let page = 1; page < 200; page++) {
    const { ids, hasMore } = await syncPage(method, page, limit)
    out.push(...ids)
    if (hasMore === false || (hasMore === undefined && ids.length < limit)) return out
  }
  throw new Error('walk did not end')
}

const CASES = [
  ['listContacts', contactIds, (n: number) => (contactCount = n)],
  ['listDeals', dealIds, (n: number) => (dealCount = n)],
  ['listPipelines', pipelineIds, (n: number) => (pipelineCount = n)],
] as const

describe.each(CASES)('highlevel %s pages exactly', (method, ids, seed) => {
  const L = 10

  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order, hasMore exact', async () => {
    seed(2 * L + 1)
    const all = ids(2 * L + 1)
    expect(await syncPage(method, 1, L)).toEqual({ ids: all.slice(0, 10), hasMore: true })
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(10, 20), hasMore: true })
    expect(await syncPage(method, 3, L)).toEqual({ ids: all.slice(20), hasMore: false })
  })

  it('reports hasMore false when the rows end exactly on a page', async () => {
    seed(2 * L)
    expect(await syncPage(method, 2, L)).toEqual({ ids: ids(20).slice(10), hasMore: false })
  })

  it('clamps a limit above 100 and still serves every row', async () => {
    seed(503)
    expect(await walk(method, 250)).toEqual(ids(503))
    for (const s of sent) {
      if (s.url.searchParams.has('limit')) {
        expect(Number(s.url.searchParams.get('limit'))).toBeLessThanOrEqual(MAX)
      }
    }
    _resetRowPager()
    expect(await syncPage(method, 2, 250)).toEqual({ ids: ids(503).slice(250, 500), hasMore: true })
  })

  it('gives meta.hasMore through parseListQuery then listPage', async () => {
    seed(25)
    const params2 = parseListQuery({ limit: '10', page: '2' })
    const rows2: Array<{ id: string }> = await adapter[method](CREDS, params2)
    const env2 = listPage(rows2, params2, 'highlevel')
    expect(env2.data.map((r) => r.id)).toEqual(ids(25).slice(10, 20))
    expect(env2.meta.hasMore).toBe(true)
    const params3 = parseListQuery({ limit: '10', page: '3' })
    const rows3: Array<{ id: string }> = await adapter[method](CREDS, params3)
    const env3 = listPage(rows3, params3, 'highlevel')
    expect(env3.data.map((r) => r.id)).toEqual(ids(25).slice(20))
    expect(env3.meta.hasMore).toBe(false)
  })
})

describe('highlevel page 2 carries the documented key', () => {
  it('listContacts sends startAfterId and startAfter from page 1 meta', async () => {
    contactCount = 21
    await syncPage('listContacts', 2, 10)
    const keyed = sent.filter((s) => s.url.searchParams.has('startAfterId'))
    expect(keyed.length).toBeGreaterThan(0)
    expect(keyed[0]!.url.searchParams.get('startAfterId')).toBe('c0010')
    expect(keyed[0]!.url.searchParams.get('startAfter')).toBe(String(1_000_009))
    for (const s of sent) expect(s.url.searchParams.get('limit')).toBe('10')
  })

  it('listDeals sends page=2', async () => {
    dealCount = 21
    await syncPage('listDeals', 2, 10)
    expect(sent.map((s) => s.url.searchParams.get('page'))).toContain('2')
    for (const s of sent) expect(s.url.searchParams.get('limit')).toBe('10')
  })

  it('getPipeline still sees every pipeline', async () => {
    pipelineCount = 40
    expect((await adapter.getPipeline(CREDS, 'p0040')).id).toBe('p0040')
  })
})

describe('highlevel pager keys are per connection', () => {
  it('never serves one connection the rows another connection fetched', async () => {
    // A limit above 100 walks upstream pages of 100; page 1 at 150 leaves
    // rows 100-199 in the pager's slot. A page-2 call under a key shared
    // across connections would be served rows 150-199 from that slot.
    tagRows = true
    contactCount = 400
    const other: Credentials = {
      accessToken: 'at-2',
      refreshToken: 'rt-2',
      extra: { locationId: 'loc-1' },
    }
    const a = await adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 150 }))
    const b = await adapter.listContacts(other, withPageSink({ page: 2, limit: 150 }))
    expect(a.map((c) => c.id.split(':')[0])).toEqual(Array(150).fill('at-1'))
    expect(b.map((c) => c.id.split(':')[0])).toEqual(Array(150).fill('at-2'))
  })
})

describe('highlevel ends a walk on the first documented end signal', () => {
  const requestsFor = (path: string): number => sent.filter((s) => s.url.pathname === path).length

  it.each(['full', 'nextPageOnly', 'totalOnly'] as const)(
    'listDeals with meta %s stops after the last full page, without an extra request',
    async (mode) => {
      dealMeta = mode
      dealCount = 20
      expect(await walk('listDeals', 10)).toEqual(dealIds(20))
      expect(requestsFor('/opportunities/search')).toBe(2)
    },
  )

  it('listDeals with no meta stops on a short page', async () => {
    dealMeta = 'none'
    dealCount = 21
    expect(await walk('listDeals', 10)).toEqual(dealIds(21))
    expect(requestsFor('/opportunities/search')).toBe(3)
  })

  it('listContacts stops on a null meta.nextPageUrl after a full page', async () => {
    contactCount = 20
    expect(await walk('listContacts', 10)).toEqual(contactIds(20))
    expect(requestsFor('/contacts/')).toBe(2)
  })
})

describe('highlevel sizes', () => {
  it('serves HighLevel pages of 25 when the caller sends no limit', async () => {
    contactCount = 60
    dealCount = 60
    const contacts = await adapter.listContacts(CREDS, withPageSink({ page: 2 }))
    expect(contacts.map((c) => c.id)).toEqual(contactIds(60).slice(25, 50))
    const deals = await adapter.listDeals(CREDS, withPageSink({ page: 2 }))
    expect(deals.map((d) => d.id)).toEqual(dealIds(60).slice(25, 50))
  })

  it('never reads a deals page number marked at another upstream size', async () => {
    // A walk at 250 asks for pages of 100, so page=2 starts at row 100. At 10,
    // page=2 starts at row 10: a mark shared across sizes serves rows 10-19.
    dealCount = 503
    expect(await walk('listDeals', 250)).toEqual(dealIds(503))
    expect(await syncPage('listDeals', 11, 10)).toEqual({
      ids: dealIds(503).slice(100, 110),
      hasMore: true,
    })
  })

  it('reports the total HighLevel counts', async () => {
    contactCount = 42
    dealCount = 37
    const p1 = withPageSink({ page: 1, limit: 10 })
    await adapter.listContacts(CREDS, p1)
    expect(readUpstreamPage(p1)?.totalCount).toBe(42)
    const p2 = withPageSink({ page: 1, limit: 10 })
    await adapter.listDeals(CREDS, p2)
    expect(readUpstreamPage(p2)?.totalCount).toBe(37)
  })
})
