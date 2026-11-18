/**
 * Oracle CX Sales collections, paged as documented.
 *
 * GET /crmRestApi/resources/{version}/{contacts,accounts,opportunities,activities}
 * (https://docs.oracle.com/en/cloud/saas/sales/faaps/op-contacts-get.html and
 * its siblings): `limit` "restricts the number of resources returned inside the
 * resource collection", `offset` is "Used to define the starting position of
 * the resource collection. If offset exceeds the resource count then no
 * resources are returned. Default value is 0.", and the response's `hasMore`
 * "Indicates whether more resources are available on the server than the
 * subset returned in the response." ManageCollections.html: "For most
 * resources, the predefined query limit to retrieve the records is set by
 * default to 500 rows or a similar value."
 *
 * All four methods used to send limit=25&offset=0 on every page. listDeals now
 * refuses (see reads.test.ts): Oracle filters that collection by default. The fake
 * Oracle below honours only those documented parameters, at the seam the
 * adapter calls: global `fetch`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { OracleCxAdapter } from '../../../../../../src/verticals/crm/adapters/oracle-cx'

const BASE = 'https://instance.example.test'
const CREDS: Credentials = { accessToken: 'at-1', extra: { instanceUrl: BASE } }
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 500

type ListMethod = 'listContacts' | 'listCompanies' | 'listActivities'

const RESOURCES: Record<ListMethod, { path: string; key: string }> = {
  listContacts: { path: 'contacts', key: 'PartyId' },
  listCompanies: { path: 'accounts', key: 'PartyId' },
  listActivities: { path: 'activities', key: 'ActivityId' },
}

interface Sent {
  path: string
  query: Record<string, string>
}

let sent: Sent[] = []
let rowCount = 0
/** Rows the fake returns per request at most; Oracle documents "500 rows or a similar value". */
let serverCap = MAX_LIMIT
/** When set, the fake answers with no items and hasMore: true, and errors on a second request. */
let emptyButMore = false

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String(1000 + i))
}

async function fakeOracle(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input))
  const query = Object.fromEntries(url.searchParams.entries())
  if ((init?.method ?? 'GET') !== 'GET') return json(405, {})
  sent.push({ path: url.pathname, query })
  const resource = Object.values(RESOURCES).find(
    (r) => url.pathname === `/crmRestApi/resources/latest/${r.path}`,
  )
  if (!resource) return json(404, {})
  if (emptyButMore) {
    if (sent.length > 1) return json(500, { title: 'looped on an empty page' })
    return json(200, { items: [], count: 0, hasMore: true, links: [] })
  }
  const offset = Number(query['offset'] ?? 0)
  const limit = Math.min(Number(query['limit'] ?? DEFAULT_LIMIT), serverCap)
  const page = ids(rowCount).slice(offset, offset + limit)
  return json(200, {
    items: page.map((id) => ({ [resource.key]: Number(id) })),
    count: page.length,
    hasMore: offset + page.length < rowCount,
    limit,
    offset,
    links: [],
  })
}

beforeEach(() => {
  sent = []
  rowCount = 0
  serverCap = MAX_LIMIT
  emptyButMore = false
  vi.stubGlobal('fetch', vi.fn(fakeOracle))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const adapter = new OracleCxAdapter()

async function callList(method: ListMethod, params: QueryParams): Promise<Array<{ id: string }>> {
  return (await adapter[method](CREDS, params)) as Array<{ id: string }>
}

async function syncPage(
  method: ListMethod,
  page: number,
  limit: number,
): Promise<{ ids: string[]; hasMore: boolean | undefined }> {
  const params: QueryParams = withPageSink({ page, limit })
  const rows = await callList(method, params)
  return { ids: rows.map((r) => r.id), hasMore: readUpstreamPage(params)?.hasMore }
}

async function walk(method: ListMethod, limit: number): Promise<string[]> {
  const out: string[] = []
  for (let page = 1; page < 200; page++) {
    const { ids: got, hasMore } = await syncPage(method, page, limit)
    out.push(...got)
    if (hasMore === false || (hasMore === undefined && got.length < limit)) return out
  }
  throw new Error('walk did not end')
}

const METHODS = ['listContacts', 'listCompanies', 'listActivities'] as const

describe.each(METHODS)('oracle-cx %s paging', (method) => {
  const L = 20

  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order', async () => {
    rowCount = 2 * L + 1
    const all = ids(rowCount)
    expect(await syncPage(method, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(method, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('reports hasMore false when the rows end exactly on a page', async () => {
    rowCount = 2 * L
    expect(await syncPage(method, 2, L)).toEqual({ ids: ids(rowCount).slice(L), hasMore: false })
  })

  it('sends the documented limit and offset on page 2, with a stable orderBy', async () => {
    rowCount = 2 * L + 1
    await syncPage(method, 2, L)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.path).toBe(`/crmRestApi/resources/latest/${RESOURCES[method].path}`)
    expect(sent[0]!.query).toMatchObject({
      limit: String(L),
      offset: String(L),
      orderBy: `${RESOURCES[method].key}:asc`,
    })
  })

  it('clamps a limit above the 500 maximum and still serves every row', async () => {
    rowCount = 1_503
    const all = ids(rowCount)
    const got = await syncPage(method, 2, 700)
    expect(got).toEqual({ ids: all.slice(700, 1_400), hasMore: true })
    for (const s of sent) expect(Number(s.query['limit'])).toBeLessThanOrEqual(MAX_LIMIT)
    sent = []
    expect(await walk(method, 700)).toEqual(all)
  })

  it('gives meta.hasMore through parseListQuery then listPage', async () => {
    rowCount = 2 * L + 1
    const all = ids(rowCount)
    const p2 = parseListQuery({ limit: String(L), page: '2' })
    const env2 = listPage(await callList(method, p2), p2, 'oracle-cx')
    expect(env2.data.map((r) => r.id)).toEqual(all.slice(L, 2 * L))
    expect(env2.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ limit: String(L), page: '3' })
    const env3 = listPage(await callList(method, p3), p3, 'oracle-cx')
    expect(env3.data.map((r) => r.id)).toEqual(all.slice(2 * L))
    expect(env3.meta.hasMore).toBe(false)
  })

  it('serves the default page size when the caller sends no limit', async () => {
    rowCount = 60
    const rows = await callList(method, withPageSink({ page: 2 }))
    expect(rows.map((r) => r.id)).toEqual(ids(rowCount).slice(DEFAULT_LIMIT, 2 * DEFAULT_LIMIT))
  })

  it('reads a 700-row page as one 500-row request and one 200-row request', async () => {
    rowCount = 1_503
    await syncPage(method, 2, 700)
    expect(sent.map((s) => [s.query['limit'], s.query['offset']])).toEqual([
      ['500', '700'],
      ['200', '1200'],
    ])
  })

  it('advances by the rows returned when the server caps below 500', async () => {
    rowCount = 1_503
    serverCap = 300
    const all = ids(rowCount)
    expect(await syncPage(method, 2, 700)).toEqual({ ids: all.slice(700, 1_400), hasMore: true })
    expect(sent.map((s) => s.query['offset'])).toEqual(['700', '1000', '1300'])
  })

  it('stops after a short upstream page that reports hasMore false', async () => {
    rowCount = 750
    expect(await syncPage(method, 2, 700)).toEqual({
      ids: ids(rowCount).slice(700),
      hasMore: false,
    })
    expect(sent.map((s) => s.query['offset'])).toEqual(['700'])
  })

  it('stops on an empty page that still claims hasMore', async () => {
    emptyButMore = true
    expect(await callList(method, withPageSink({ page: 1, limit: L }))).toEqual([])
    expect(sent).toHaveLength(1)
  })

  it('keeps the fields projection on the paged request', async () => {
    rowCount = 5
    await syncPage(method, 1, L)
    expect((sent[0]!.query['fields'] ?? '').split(',')).toContain(RESOURCES[method].key)
  })
})
