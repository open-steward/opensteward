/**
 * Follow Up Boss list paging: 1-based `page` + caller's `limit` → FUB's
 * `offset` + `limit`, with the end of the collection read from
 * `_metadata.total`.
 *
 * From https://docs.followupboss.com/reference/pagination:
 *
 *   "List methods that return a collection of resources are paginated using
 *    `next` or `offset` and `limit` query parameters."
 *   "The default limit value is `10` and default offset value is `0`."
 *   "The maximum value for the limit parameter is `100`."
 *
 * Every list endpoint's example response carries
 * `_metadata: { collection, offset, limit, total }`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { FollowUpBossAdapter } from '../../../../../../src/verticals/crm/adapters/follow-up-boss/index'

const CREDS = { accessToken: 'key' }
/** Documented: "The maximum value for the limit parameter is `100`." */
const MAX = 100

type Call = (a: FollowUpBossAdapter, p: QueryParams) => Promise<{ id: string }[]>

const LISTS: { name: string; path: string; call: Call }[] = [
  { name: 'listContacts', path: 'people', call: (a, p) => a.listContacts(CREDS, p) },
  { name: 'listDeals', path: 'deals', call: (a, p) => a.listDeals(CREDS, p) },
  { name: 'listPipelines', path: 'pipelines', call: (a, p) => a.listPipelines(CREDS, p) },
  { name: 'listActivities', path: 'tasks', call: (a, p) => a.listActivities(CREDS, p) },
  { name: 'listNotes', path: 'notes', call: (a, p) => a.listNotes(CREDS, p) },
]

/**
 * A fake Follow Up Boss that honours ONLY the documented list parameters:
 * `offset` (default 0) and `limit` (default 10, max 100). An out-of-range
 * value is refused rather than corrected.
 */
function fakeFub(collection: string, total: number, opts: { noTotal?: boolean } = {}) {
  const store = Array.from({ length: total }, (_, i) => ({ id: i + 1, name: `n${i + 1}` }))
  const sent: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    if ((init?.method ?? 'GET') !== 'GET' || url.pathname !== `/v1/${collection}`) {
      return new Response(`unexpected ${init?.method} ${url.pathname}`, { status: 404 })
    }
    sent.push(url)
    const offset = Number(url.searchParams.get('offset') ?? '0')
    const limit = Number(url.searchParams.get('limit') ?? '10')
    if (!Number.isInteger(offset) || offset < 0) {
      return new Response(`bad offset ${String(offset)}`, { status: 400 })
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX) {
      return new Response(`bad limit ${String(limit)}`, { status: 400 })
    }
    return new Response(
      JSON.stringify({
        _metadata: { collection, offset, limit, ...(opts.noTotal ? {} : { total: store.length }) },
        [collection]: store.slice(offset, offset + limit),
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
  return { ids: store.map((r) => String(r.id)), sent }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(LISTS)('follow-up-boss $name paging', ({ path, call }) => {
  it('serves every row once over pages 1..3 of 2L+1 rows, with exact hasMore', async () => {
    const L = 4
    const { ids } = fakeFub(path, 2 * L + 1)
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await call(new FollowUpBossAdapter(), params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
  })

  it('sends the documented offset on page 2', async () => {
    const { sent } = fakeFub(path, 9)
    await call(new FollowUpBossAdapter(), withPageSink({ page: 2, limit: 4 }))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.searchParams.get('offset')).toBe('4')
    expect(sent[0]!.searchParams.get('limit')).toBe('4')
  })

  it('clamps a limit above 100 and still serves every row', async () => {
    const { ids, sent } = fakeFub(path, 2 * MAX + 1)
    const seen: string[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 500 })
      seen.push(...(await call(new FollowUpBossAdapter(), params)).map((r) => r.id))
      expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
    }
    expect(sent.map((u) => u.searchParams.get('limit'))).toEqual(['100', '100', '100'])
    expect(seen).toEqual(ids)
  })

  it('sends a whole limit of at least 1 when a direct caller passes 0 or a fraction', async () => {
    const { sent } = fakeFub(path, 9)
    await call(new FollowUpBossAdapter(), withPageSink({ page: 1, limit: 0 }))
    await call(new FollowUpBossAdapter(), withPageSink({ page: 2, limit: 2.5 }))
    expect(sent.map((u) => u.searchParams.get('limit'))).toEqual(['1', '2'])
    expect(sent[1]!.searchParams.get('offset')).toBe('2')
  })

  it('gives the right meta.hasMore through parseListQuery + listPage', async () => {
    fakeFub(path, 25)
    const adapter = new FollowUpBossAdapter()
    const params = parseListQuery({ page: '2', limit: '10' }, adapter)
    const env = listPage(await call(adapter, params), params, 'follow-up-boss')
    expect(env.data).toHaveLength(10)
    expect(env.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '10' }, adapter)
    const envLast = listPage(await call(adapter, last), last, 'follow-up-boss')
    expect(envLast.data).toHaveLength(5)
    expect(envLast.meta.hasMore).toBe(false)
  })

  it('ends on a full last page when the rows are an exact multiple of the limit', async () => {
    fakeFub(path, 8)
    const params = withPageSink({ page: 2, limit: 4 })
    expect(await call(new FollowUpBossAdapter(), params)).toHaveLength(4)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('reports _metadata.total as the totalCount', async () => {
    fakeFub(path, 9)
    const params = withPageSink({ page: 1, limit: 4 })
    await call(new FollowUpBossAdapter(), params)
    expect(readUpstreamPage(params)?.totalCount).toBe(9)
  })

  it('claims no end when _metadata.total is missing', async () => {
    fakeFub(path, 25, { noTotal: true })
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await call(new FollowUpBossAdapter(), params)).toHaveLength(10)
    expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
  })
})

describe('follow-up-boss capabilities', () => {
  it('declares the documented maximum', () => {
    expect(new FollowUpBossAdapter().capabilities?.maxPageSize).toBe(MAX)
  })
})
