/**
 * Mautic's segment list and contact activity feed, paged as documented.
 *
 * GET /segments (https://devdocs.mautic.org/en/5.x/rest_api/segments.html):
 * `start` is "Starting row for the returned entities - defaults to 0",
 * `limit` is "Maximum number of entities to return - defaults to 30", and
 * `total` is "Total count of Segments". Rows sit in the `lists` object, keyed
 * by segment id.
 *
 * GET /contacts/activity (https://devdocs.mautic.org/en/5.x/rest_api/contacts.html):
 * `page` is "What page number to load", `limit` is "Limit of events per
 * page", and `maxPages` is "How many pages of events are there". Mautic
 * applies `limit` per event type and merges the types into one `events`
 * array, so one upstream page can hold more than `limit` rows.
 *
 * Both methods used to send limit=25&start=0 on every page. The fake Mautic
 * below honours only those documented parameters, at the seam the adapter
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
import { MauticAdapter } from '../../../../../../src/verticals/crm/adapters/mautic'

const BASE = 'https://mautic.example.test'
const CREDS: Credentials = { accessToken: 'at-1', extra: { instanceUrl: BASE } }
const SEGMENTS_DEFAULT = 30
const ACTIVITY_DEFAULT = 25
const TYPES = ['page.hit', 'form.submitted'] as const

interface Sent {
  path: string
  query: Record<string, string>
}

let sent: Sent[] = []
let rowCount = 0

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function segmentIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String(i + 1))
}

/** Events of one type: the first type gets the odd rows, the second the even. */
function eventsOfType(type: string): Array<{ eventId: string; eventType: string }> {
  const t = TYPES.indexOf(type as (typeof TYPES)[number])
  const out: Array<{ eventId: string; eventType: string }> = []
  for (let i = 1; i <= rowCount; i++) {
    if ((i - 1) % TYPES.length === t) out.push({ eventId: `${type}${i}`, eventType: type })
  }
  return out
}

/** One activity page as Mautic builds it: `limit` rows per type, merged. */
function activityPage(page: number, limit: number) {
  const perType = TYPES.map((t) => eventsOfType(t))
  const events = perType.flatMap((rows) => rows.slice((page - 1) * limit, page * limit))
  const maxPages = Math.ceil(Math.max(...perType.map((r) => r.length)) / limit)
  // Documented key order: `filters` precedes `events`, so a reader that takes
  // the first collection in the body instead of `events` gets the wrong rows.
  return {
    filters: { search: '', includeEvents: [], excludeEvents: [] },
    events,
    order: ['timestamp', 'DESC'],
    types: {},
    total: rowCount,
    page,
    limit,
    maxPages,
  }
}

/** Every event id in stream order, walking the upstream at its default size. */
function activityStream(): string[] {
  const out: string[] = []
  for (let p = 1; ; p++) {
    const res = activityPage(p, ACTIVITY_DEFAULT)
    out.push(...res.events.map((e) => e.eventId))
    if (p >= res.maxPages) return out
  }
}

async function fakeMautic(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input))
  const query = Object.fromEntries(url.searchParams.entries())
  if ((init?.method ?? 'GET') !== 'GET') return json(405, {})
  sent.push({ path: url.pathname, query })
  if (url.pathname === '/api/segments') {
    const start = Number(query['start'] ?? 0)
    const limit = Number(query['limit'] ?? SEGMENTS_DEFAULT)
    const lists: Record<string, unknown> = {}
    for (const id of segmentIds(rowCount).slice(start, start + limit)) {
      lists[id] = { id: Number(id), name: `Segment ${id}`, isPublished: true }
    }
    return json(200, { total: rowCount, lists })
  }
  if (url.pathname === '/api/contacts/activity') {
    const page = Number(query['page'] ?? 1)
    const limit = Number(query['limit'] ?? ACTIVITY_DEFAULT)
    const body = activityPage(page, limit)
    // `maxPages` is the documented end. A request past it is an adapter bug,
    // not a harmless empty page.
    if (page > Math.max(body.maxPages, 1)) return json(500, { errors: [{ code: 500 }] })
    return json(200, body)
  }
  return json(404, { errors: [{ code: 404 }] })
}

beforeEach(() => {
  sent = []
  rowCount = 0
  _resetRowPager()
  vi.stubGlobal('fetch', vi.fn(fakeMautic))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const adapter = new MauticAdapter()

type ListMethod = 'listPipelines' | 'listActivities'

interface Row {
  id: string
  metadata?: Record<string, unknown>
}

async function callList(method: ListMethod, params: QueryParams): Promise<Row[]> {
  return (await adapter[method](CREDS, params)) as Row[]
}

function rowId(r: Row): string {
  const eventId = r.metadata?.['eventId']
  return typeof eventId === 'string' ? eventId : r.id
}

async function syncPage(
  method: ListMethod,
  page: number,
  limit: number,
): Promise<{ ids: string[]; hasMore: boolean | undefined }> {
  const params: QueryParams = withPageSink({ page, limit })
  const rows = await callList(method, params)
  return { ids: rows.map(rowId), hasMore: readUpstreamPage(params)?.hasMore }
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

const expected: Record<ListMethod, () => string[]> = {
  listPipelines: () => segmentIds(rowCount),
  listActivities: activityStream,
}

describe.each(['listPipelines', 'listActivities'] as const)('mautic %s paging', (method) => {
  const L = 20

  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order', async () => {
    rowCount = 2 * L + 1
    const all = expected[method]()
    expect(all).toHaveLength(41)
    expect(await syncPage(method, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(method, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('reports hasMore false when the rows end exactly on a page', async () => {
    rowCount = 2 * L
    const all = expected[method]()
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L), hasMore: false })
  })

  it('serves every row at a limit above any page size, and clamps an API limit to the router max', async () => {
    rowCount = 1_203
    expect(await walk(method, 500)).toEqual(expected[method]())
    _resetRowPager()
    const params = parseListQuery({ limit: '9999', page: '2' })
    expect(params.limit).toBe(500)
    const env = listPage(await callList(method, params), params, 'mautic')
    expect(env.data.map(rowId)).toEqual(expected[method]().slice(500, 1_000))
    expect(env.meta.hasMore).toBe(true)
  })

  it('gives meta.hasMore through parseListQuery then listPage', async () => {
    rowCount = 2 * L + 1
    const all = expected[method]()
    const p2 = parseListQuery({ limit: String(L), page: '2' })
    const env2 = listPage(await callList(method, p2), p2, 'mautic')
    expect(env2.data.map(rowId)).toEqual(all.slice(L, 2 * L))
    expect(env2.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ limit: String(L), page: '3' })
    const env3 = listPage(await callList(method, p3), p3, 'mautic')
    expect(env3.data.map(rowId)).toEqual(all.slice(2 * L))
    expect(env3.meta.hasMore).toBe(false)
  })
})

describe('mautic page-2 requests carry the documented keys', () => {
  it('listPipelines sends start and limit, and reports the documented total', async () => {
    rowCount = 41
    const params: QueryParams = withPageSink({ page: 2, limit: 20 })
    await callList('listPipelines', params)
    expect(sent).toEqual([{ path: '/api/segments', query: { start: '20', limit: '20' } }])
    expect(readUpstreamPage(params)?.totalCount).toBe(41)
  })

  it('listActivities sends exactly page and a fixed per-type limit', async () => {
    rowCount = 200
    // Caller page 2 at 60 rows is rows 60..119: upstream pages of 50 merged rows.
    await syncPage('listActivities', 2, 60)
    expect(sent).toEqual(
      ['1', '2', '3'].map((page) => ({
        path: '/api/contacts/activity',
        query: { page, limit: String(ACTIVITY_DEFAULT) },
      })),
    )
  })

  it('listActivities stops at maxPages without asking for a page past it', async () => {
    rowCount = 100 // 2 types x 50 rows: maxPages 2 at 25 per type
    expect(await walk('listActivities', 500)).toEqual(activityStream())
    expect(sent.map((s) => s.query['page'])).toEqual(['1', '2'])
  })

  it('listActivities serves the default page size when the caller sends no limit', async () => {
    rowCount = 200
    const rows = await callList('listActivities', withPageSink({ page: 1 }))
    expect(rows.map(rowId)).toEqual(activityStream().slice(0, 25))
  })

  it('listActivities keeps walks of two connections apart', async () => {
    rowCount = 200
    // Connection 1 reads page 1: one upstream page of 50 rows, 30 left over.
    await syncPage('listActivities', 1, 20)
    sent = []
    // Connection 2 asks for page 2. A shared pager would resume connection 1's
    // walk; its own walk has to start again at page=1.
    const rows = (await adapter.listActivities(
      { ...CREDS, accessToken: 'at-2' },
      withPageSink({ page: 2, limit: 20 }),
    )) as Row[]
    expect(sent.map((s) => s.query['page'])).toEqual(['1'])
    expect(rows.map(rowId)).toEqual(activityStream().slice(20, 40))
  })
})
