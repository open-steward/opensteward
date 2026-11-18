/**
 * ShipsGo listCarriers paging: 1-based `page` + caller's `limit` → ShipsGo v2
 * `skip` (a row count) + `take`.
 *
 * From the ShipsGo v2 OpenAPI spec behind https://api.shipsgo.com/docs/v2/
 * (https://api.shipsgo.com/docs/v2/specs/openapi.json), on GET /ocean/carriers:
 *
 *   skip  (integer, minimum 0)
 *         "The number of records to skip before returning the results. The default value is `0`."
 *   take  (integer, minimum 1, maximum 100)
 *         "The number of records to return. The default value is `25`."
 *   meta.more
 *         "Indicates whether there are more resources to fetch."
 *   meta.total
 *         "Indicates the total number of resources, it's only available when there is no more resources."
 *
 * `skip` counts records, not pages, so page N skips (N - 1) × the take actually
 * sent (after the clamp to 100), and the adapter declares `maxPageSize: 100`.
 * `meta.more` / `meta.total` are forwarded with reportUpstreamPage, so a page
 * clamped to 100 under a larger caller limit is not mistaken for the last one.
 *
 * Not covered here: listShipments and listTrackingEvents. They send a 1-based
 * `pageIndex` to `ShipmentService/v2/list` on https://api.shipsgo.com/api/, a
 * path that appears in none of ShipsGo's published docs (the v1.0–v1.2 PDFs
 * list only ContainerService endpoints on https://shipsgo.com/api/; the v2 spec
 * pages /ocean/shipments with skip/take) and that the live API answers with
 * 404 "The route api/ShipmentService/v2/list could not be found." Their paging
 * is left as it was; they need a rewrite onto v2, not a paging fix.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  collectionIsComplete,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { ShipsGoAdapter } from '../../../../../../src/verticals/logistics/adapters/shipsgo/index'

const CREDS = { accessToken: 'sg_test_token' }
const CARRIERS_URL = 'https://api.shipsgo.com/v2/ocean/carriers'
/** Documented: `take` "maximum": 100. */
const TAKE_MAX = 100
/** Documented: "The default value is `25`." */
const TAKE_DEFAULT = 25
/** Documented: "The default value is `0`." */
const SKIP_DEFAULT = 0
/** The adapter's own size for a direct call that names no usable limit. */
const ADAPTER_DEFAULT = 20
const N_ROWS = 1000

/**
 * A fake GET /ocean/carriers that honours ONLY the documented query
 * parameters. `skip` (records to skip, >= 0) and `take` (1..100) drive the
 * slice; `filters` and `order_by` are documented too, so they are accepted,
 * but not modelled (the adapter sends neither, and the documented default
 * order is by name ascending, which the fake's fixed order stands in for).
 * Anything undocumented, or a value out of range, is refused. `meta` follows
 * the spec: `more` always, `total` only when there is nothing more.
 */
function fakeShipsGo(total: number) {
  const all = Array.from({ length: total }, (_, i) => ({
    scac: String(i + 1),
    name: `Carrier ${i + 1}`,
    status: 'ACTIVE',
  }))
  const get = vi.fn(
    async (
      url: string,
      cfg?: { headers?: Record<string, string>; params?: Record<string, unknown> },
    ) => {
      if (url !== CARRIERS_URL) throw new Error(`unexpected url ${url}`)
      if (cfg?.headers?.['X-Shipsgo-User-Token'] !== CREDS.accessToken) {
        throw new Error('missing X-Shipsgo-User-Token')
      }
      const params = cfg?.params ?? {}
      const documented = ['skip', 'take', 'filters', 'order_by']
      const extra = Object.keys(params).filter((k) => !documented.includes(k))
      if (extra.length > 0) throw new Error(`undocumented query parameter(s): ${extra.join(', ')}`)
      const skip = params['skip'] ?? SKIP_DEFAULT
      const take = params['take'] ?? TAKE_DEFAULT
      if (typeof skip !== 'number' || !Number.isInteger(skip) || skip < 0) {
        throw new Error(`skip must be an integer >= 0 (got ${String(skip)})`)
      }
      if (typeof take !== 'number' || !Number.isInteger(take) || take < 1 || take > TAKE_MAX) {
        throw new Error(`take must be an integer in 1..${TAKE_MAX} (got ${String(take)})`)
      }
      const carriers = all.slice(skip, skip + take)
      const more = skip + take < total
      return {
        data: { message: 'SUCCESS', carriers, meta: { more, total: more ? null : total } },
      }
    },
  )
  vi.spyOn(axios, 'get').mockImplementation(get as never)
  return { get }
}

/** What each request asked for, with ShipsGo's documented defaults filled in. */
function sent(get: ReturnType<typeof fakeShipsGo>['get']) {
  return get.mock.calls.map((c) => {
    const p = c[1]?.params ?? {}
    return { skip: p['skip'] ?? SKIP_DEFAULT, take: p['take'] ?? TAKE_DEFAULT }
  })
}

function ids(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(start + i))
}

type Row = { id?: string }

const METHODS = [
  {
    name: 'listCarriers',
    call: (a: ShipsGoAdapter, p: QueryParams): Promise<Row[]> => a.listCarriers(CREDS, p),
  },
] as const

afterEach(() => vi.restoreAllMocks())

describe('shipsgo capabilities', () => {
  it('declares the documented maximum take (100) so the sync worker never asks for more', () => {
    expect(new ShipsGoAdapter().capabilities).toEqual(
      expect.objectContaining({ maxPageSize: TAKE_MAX }),
    )
  })
})

describe.each(METHODS)('shipsgo $name paging', ({ call }) => {
  const adapter = () => new ShipsGoAdapter()
  const run = async (query: Record<string, string>) =>
    (await call(adapter(), parseListQuery(query))).map((r) => r.id)
  /** Params at a page the router never sends, as a direct caller builds them. */
  const runAt = async (page: number) => {
    const params = parseListQuery({ limit: '10' })
    params.page = page
    return (await call(adapter(), params)).map((r) => r.id)
  }
  const direct = async (params: QueryParams) => (await call(adapter(), params)).map((r) => r.id)

  it('page 1 returns the first rows and skips none', async () => {
    const { get } = fakeShipsGo(N_ROWS)
    expect(await run({ page: '1', limit: '10' })).toEqual(ids(1, 10))
    expect(sent(get)).toEqual([{ skip: 0, take: 10 }])
  })

  it('page 2 returns the next rows and skips one full page', async () => {
    const { get } = fakeShipsGo(N_ROWS)
    expect(await run({ page: '2', limit: '10' })).toEqual(ids(11, 10))
    expect(sent(get)).toEqual([{ skip: 10, take: 10 }])
  })

  it('pages 1 and 2 do not overlap', async () => {
    fakeShipsGo(N_ROWS)
    const p1 = await run({ page: '1', limit: '10' })
    const p2 = await run({ page: '2', limit: '10' })
    expect(p1.filter((id) => p2.includes(id))).toEqual([])
  })

  it('a missing page returns the first rows', async () => {
    const { get } = fakeShipsGo(N_ROWS)
    expect(await run({ limit: '10' })).toEqual(ids(1, 10))
    expect(sent(get)).toEqual([{ skip: 0, take: 10 }])
  })

  // parseListQuery reads 0, -3 and non-numbers as the first page before an
  // adapter sees them, so this guard is for direct callers: built directly.
  it.each([0, -3])('a direct page %s is treated as page 1', async (page) => {
    const { get } = fakeShipsGo(N_ROWS)
    expect(await runAt(page)).toEqual(ids(1, 10))
    expect(sent(get)).toEqual([{ skip: 0, take: 10 }])
  })

  it('a limit above the documented max (100) is clamped, and page 2 strides by the clamp', async () => {
    const { get } = fakeShipsGo(N_ROWS)
    expect(await run({ page: '1', limit: '500' })).toEqual(ids(1, 100))
    expect(await run({ page: '2', limit: '500' })).toEqual(ids(101, 100))
    expect(sent(get)).toEqual([
      { skip: 0, take: 100 },
      { skip: 100, take: 100 },
    ])
  })

  it("a direct call with no params keeps the adapter's own default size", async () => {
    const { get } = fakeShipsGo(N_ROWS)
    expect(await direct({})).toEqual(ids(1, ADAPTER_DEFAULT))
    expect(sent(get)).toEqual([{ skip: 0, take: ADAPTER_DEFAULT }])
  })

  it("a direct call with no limit keeps the adapter's own default size", async () => {
    const { get } = fakeShipsGo(N_ROWS)
    expect(await direct({ page: 2 })).toEqual(ids(21, ADAPTER_DEFAULT))
    expect(sent(get)).toEqual([{ skip: ADAPTER_DEFAULT, take: ADAPTER_DEFAULT }])
  })

  it.each([0, -5, Number.NaN])(
    'a direct call with limit %s falls back to the default size (take is documented minimum 1)',
    async (limit) => {
      const { get } = fakeShipsGo(N_ROWS)
      expect(await direct({ page: 2, limit })).toEqual(ids(21, ADAPTER_DEFAULT))
      expect(sent(get)).toEqual([{ skip: ADAPTER_DEFAULT, take: ADAPTER_DEFAULT }])
    },
  )

  it('a direct call with numeric-string page and limit pages like the numbers they spell', async () => {
    const { get } = fakeShipsGo(N_ROWS)
    expect(await direct({ page: '2', limit: '10' } as unknown as QueryParams)).toEqual(ids(11, 10))
    expect(sent(get)).toEqual([{ skip: 10, take: 10 }])
  })

  /** Pages exactly as SyncWorker does: its `hasMore` when reported, else a short page. */
  async function walk(a: ShipsGoAdapter, L: number, max: number) {
    const got: (string | undefined)[] = []
    let requests = 0
    for (let k = 1; k <= max; k++) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await call(a, params)
      requests++
      got.push(...rows.map((r) => r.id))
      const reported = readUpstreamPage(params)?.hasMore
      const last = typeof reported === 'boolean' ? !reported : rows.length < L
      if (last) break
    }
    return { got, requests }
  }

  it.each([10, 7, TAKE_MAX])(
    'walking pages like the sync worker (limit %i, N = 2L + 1) returns every row once, in order',
    async (L) => {
      const n = 2 * L + 1
      fakeShipsGo(n)
      const { got, requests } = await walk(adapter(), L, n + 1)
      expect(got).toEqual(ids(1, n))
      expect(requests).toBe(3)
    },
  )

  it.each([10, TAKE_MAX])(
    'a collection that is an exact multiple of the page (limit %i, N = 2L) ends on meta.more, with no empty extra request',
    async (L) => {
      const n = 2 * L
      const { get } = fakeShipsGo(n)
      const { got, requests } = await walk(adapter(), L, n + 1)
      expect(got).toEqual(ids(1, n))
      expect(requests).toBe(2)
      expect(get).toHaveBeenCalledTimes(2)
    },
  )
})

describe('shipsgo listCarriers reports ShipsGo paging meta on the API path', () => {
  const adapter = () => new ShipsGoAdapter()
  const apiPage = async (total: number, query: Record<string, string>) => {
    fakeShipsGo(total)
    const params = parseListQuery(query)
    const rows = await adapter().listCarriers(CREDS, params)
    return { rows, params, meta: listPage(rows, params, 'shipsgo').meta }
  }

  it('a page clamped to 100 under limit=250 says hasMore: true (meta.more), not false', async () => {
    const { rows, meta } = await apiPage(N_ROWS, { limit: '250' })
    expect(rows.map((r) => r.id)).toEqual(ids(1, 100))
    expect(meta.hasMore).toBe(true)
    expect(meta.totalCount).toBeNull()
  })

  it('the last page carries meta.total and hasMore: false', async () => {
    const { rows, meta } = await apiPage(N_ROWS, { page: '10', limit: '100' })
    expect(rows.map((r) => r.id)).toEqual(ids(901, 100))
    expect(meta.totalCount).toBe(N_ROWS)
    expect(meta.hasMore).toBe(false)
  })

  it('a queryless list of a collection that fits one page is complete, with its total', async () => {
    const { rows, params, meta } = await apiPage(40, {})
    expect(rows).toHaveLength(40)
    expect(meta.totalCount).toBe(40)
    expect(meta.hasMore).toBe(false)
    expect(collectionIsComplete(params, rows)).toBe(true)
  })

  it('a queryless full page with more to fetch is neither complete nor last', async () => {
    const { rows, params, meta } = await apiPage(N_ROWS, {})
    expect(rows).toHaveLength(100)
    expect(meta.hasMore).toBe(true)
    expect(collectionIsComplete(params, rows)).toBe(false)
  })
})
