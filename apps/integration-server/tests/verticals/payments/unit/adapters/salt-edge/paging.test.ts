/**
 * Salt Edge paging contract: listCustomers (GET /api/v6/customers).
 *
 * https://docs.saltedge.com/v6/#pagination:
 *
 *   "By default, when the Client requests a list of paginated resources, a
 *    next_id in the meta object response will be received. The value of
 *    next_id corresponds to the resource_id with which the next page will
 *    commence. To customize the number of items per page the per_page
 *    attribute in the request can be included, specifying a range between 100
 *    and 1000 items. [...] If no per_page parameter is sent, the default is
 *    set to 100 items. To retrieve all the data, an additional from_id
 *    parameter with the corresponding ID in the URL or use the next_page
 *    attribute should be included, which already contains from_id parameter
 *    appended to the URL."
 *
 * So an upstream page is 100–1000 rows starting at `from_id`, and a caller
 * page of fewer than 100 rows cannot be one upstream page. The adapter walks
 * `from_id <- meta.next_id` with pageByRows and cuts the caller's rows out.
 *
 * The fake below honours ONLY `per_page` (100..1000, default 100) and
 * `from_id`: any other query parameter, or a size out of range, is refused.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetRowPager,
} from '@opensteward/shared'
import type { PageMaxBearing, QueryParams } from '@opensteward/shared'
import { SaltEdgeAdapter } from '../../../../../../src/verticals/payments/adapters/salt-edge/index'

const CREDS = { accessToken: 'app-id-test', extra: { secret: 'secret-test' } }

interface Req {
  path: string
  params: Record<string, unknown> | undefined
}

/** Numeric-string ids, ascending, as Salt Edge ids are. */
function ids(n: number, base = 1000): string[] {
  return Array.from({ length: n }, (_, i) => String(base + i))
}

/** A fake Salt Edge GET /customers holding `all`. */
function fakeCustomers(all: string[]): { reqs: Req[] } {
  const reqs: Req[] = []
  const get = vi.fn(async (p: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params
    reqs.push({ path: p, params: params ? { ...params } : undefined })
    if (p !== '/customers') throw new Error(`unexpected path ${p}`)
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v === undefined) continue
      if (k !== 'per_page' && k !== 'from_id') throw new Error(`undocumented query parameter ${k}`)
    }
    const perPage = params?.per_page === undefined ? 100 : Number(params.per_page)
    if (!Number.isInteger(perPage) || perPage < 100 || perPage > 1000) {
      throw Object.assign(new Error('per_page out of range'), { response: { status: 400 } })
    }
    const from = params?.from_id === undefined ? 0 : all.indexOf(String(params.from_id))
    if (from < 0) throw Object.assign(new Error('unknown from_id'), { response: { status: 400 } })
    const rows = all.slice(from, from + perPage)
    const nextId = from + perPage < all.length ? all[from + perPage]! : null
    return {
      data: {
        data: rows.map((id) => ({ id, customer_id: id, identifier: `user-${id}` })),
        meta: {
          next_id: nextId,
          next_page:
            nextId === null ? null : `/api/v6/customers?from_id=${nextId}&per_page=${perPage}`,
        },
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    delete: vi.fn(),
    defaults: {},
  } as never)
  return { reqs }
}

async function drive(
  L: number,
  pages: number,
): Promise<{ ids: string[]; hasMore: Array<boolean | undefined>; sizes: number[] }> {
  const adapter = new SaltEdgeAdapter()
  const out: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const sizes: number[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit: L } as QueryParams)
    const rows = await adapter.listCustomers(CREDS, params)
    sizes.push(rows.length)
    out.push(...rows.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids: out, hasMore, sizes }
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetRowPager()
})

describe('Salt Edge listCustomers paging', () => {
  it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore (L under the per_page floor)', async () => {
    const L = 7
    const all = ids(2 * L + 1)
    const { reqs } = fakeCustomers(all)
    const { ids: got, hasMore, sizes } = await drive(L, 3)
    expect(got).toEqual(all)
    expect(sizes).toEqual([L, L, 1])
    expect(hasMore).toEqual([true, true, false])
    expect(reqs.every((r) => r.params?.per_page === 100)).toBe(true)
  })

  it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore (L in the per_page range)', async () => {
    const L = 150
    const all = ids(2 * L + 1)
    const { reqs } = fakeCustomers(all)
    const { ids: got, hasMore, sizes } = await drive(L, 3)
    expect(got).toEqual(all)
    expect(sizes).toEqual([L, L, 1])
    expect(hasMore).toEqual([true, true, false])
    expect(reqs.every((r) => r.params?.per_page === L)).toBe(true)
  })

  it('carries the documented from_id key, taken from meta.next_id, on the request behind caller page 2', async () => {
    const L = 150
    const all = ids(2 * L + 1)
    const { reqs } = fakeCustomers(all)
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    const rows = await new SaltEdgeAdapter().listCustomers(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(all.slice(L, 2 * L))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(reqs.map((r) => r.params?.from_id)).toContain(all[L])
  })

  it('walks from_id across several upstream pages when L is under the per_page floor', async () => {
    const L = 60
    const all = ids(2 * L + 1 + 200)
    const { reqs } = fakeCustomers(all)
    const params = withPageSink({ page: 3, limit: L } as QueryParams)
    const rows = await new SaltEdgeAdapter().listCustomers(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(all.slice(2 * L, 3 * L))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(reqs.map((r) => r.params?.from_id)).toContain(all[100])
  })

  it('treats a missing meta.next_id as the end', async () => {
    const all = ids(5)
    const get = vi.fn(async () => ({
      data: { data: all.map((id) => ({ id })), meta: {} },
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), defaults: {} } as never)
    const params = withPageSink({ page: 1, limit: 5 } as QueryParams)
    const rows = await new SaltEdgeAdapter().listCustomers(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(all)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('clamps a limit above the per_page maximum and still serves every row', async () => {
    const all = ids(2501)
    const { reqs } = fakeCustomers(all)
    const params = withPageSink({ page: 1, limit: 2500 } as QueryParams)
    const rows = await new SaltEdgeAdapter().listCustomers(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(all.slice(0, 2500))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(reqs.every((r) => r.params?.per_page === 1000)).toBe(true)
  })

  it('clamps a limit above the router maximum and still serves every row', async () => {
    const all = ids(1201)
    fakeCustomers(all)
    const adapter = new SaltEdgeAdapter()
    const got: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const p = parseListQuery(
        { limit: '5000', page: String(page) },
        adapter as unknown as PageMaxBearing,
      )
      expect(p.limit).toBe(500)
      const rows = await adapter.listCustomers(CREDS, p)
      got.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(p)?.hasMore)
    }
    expect(got).toEqual(all)
    expect(more).toEqual([true, true, false])
  })

  it('gives meta.hasMore through parseListQuery and listPage', async () => {
    const all = ids(7)
    fakeCustomers(all)
    const adapter = new SaltEdgeAdapter()
    const p1 = parseListQuery({ limit: '3', page: '1' }, adapter as unknown as PageMaxBearing)
    const e1 = listPage<{ id: string }>(await adapter.listCustomers(CREDS, p1), p1, 'salt-edge')
    expect(e1.data.map((r) => r.id)).toEqual(all.slice(0, 3))
    expect(e1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '3', page: '3' }, adapter as unknown as PageMaxBearing)
    const e3 = listPage<{ id: string }>(await adapter.listCustomers(CREDS, p3), p3, 'salt-edge')
    expect(e3.data.map((r) => r.id)).toEqual(all.slice(6))
    expect(e3.meta.hasMore).toBe(false)
  })

  it('never serves one connection the rows another connection fetched', async () => {
    const L = 7
    const a = ids(2 * L + 1)
    const b = ids(2 * L + 1, 5000)
    const adapter = new SaltEdgeAdapter()
    fakeCustomers(a)
    await adapter.listCustomers(
      { accessToken: 'app-a', extra: { secret: 's' } },
      withPageSink({ page: 1, limit: L } as QueryParams),
    )
    vi.restoreAllMocks()
    fakeCustomers(b)
    const rows = await adapter.listCustomers(
      { accessToken: 'app-b', extra: { secret: 's' } },
      withPageSink({ page: 2, limit: L } as QueryParams),
    )
    expect(rows.map((r) => r.id)).toEqual(b.slice(L, 2 * L))
  })
  it('keys the walk on per_page: a second limit on the same connection starts its own from_id walk', async () => {
    const all = ids(400)
    const { reqs } = fakeCustomers(all)
    const adapter = new SaltEdgeAdapter()
    const p1 = withPageSink({ page: 1, limit: 7 } as QueryParams)
    expect((await adapter.listCustomers(CREDS, p1)).map((r) => r.id)).toEqual(all.slice(0, 7))
    expect(reqs.map((r) => r.params?.per_page)).toEqual([100])
    reqs.length = 0
    const p2 = withPageSink({ page: 2, limit: 150 } as QueryParams)
    expect((await adapter.listCustomers(CREDS, p2)).map((r) => r.id)).toEqual(all.slice(150, 300))
    expect(readUpstreamPage(p2)?.hasMore).toBe(true)
    // A walk sized per_page=150 never resumes from a from_id minted by the per_page=100 walk.
    expect(reqs.every((r) => r.params?.per_page === 150)).toBe(true)
    expect(reqs[0]?.params?.from_id).toBeUndefined()
  })

  it('sends the documented default per_page=100 and serves 100 rows when the caller gives no limit', async () => {
    const all = ids(250)
    const { reqs } = fakeCustomers(all)
    const params = withPageSink({ page: 1 } as QueryParams)
    const rows = await new SaltEdgeAdapter().listCustomers(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(all.slice(0, 100))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(reqs.length).toBeGreaterThan(0)
    expect(reqs.every((r) => r.params?.per_page === 100)).toBe(true)
  })

  it('serves a sequential walk under the per_page floor from one upstream request', async () => {
    const L = 7
    const all = ids(2 * L + 1)
    const { reqs } = fakeCustomers(all)
    const { ids: got } = await drive(L, 3)
    expect(got).toEqual(all)
    expect(reqs).toHaveLength(1)
  })
})
