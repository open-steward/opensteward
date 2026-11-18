/**
 * Nova Poshta (Nova Post) fulfillment orders: listOrders and getOrder.
 *
 * The adapter called GET /fulfillment/{cc}/orders/status and
 * /fulfillment/UA/orders/{id}/details: the `/v1/` segment was missing, the
 * country defaulted to an invented 'UA', it sent an undocumented `limit`,
 * took `page` from `params.cursor`, and read `documents`/`items` out of a
 * response whose documented envelope is `data`/`links`/`meta`.
 *
 * First-party spec (OpenAPI embedded in the GitBook page):
 *   https://api-portal.novapost.com/methods/methods/fullfillment.md
 *     GET /fulfillment/{countrycode}/v1/orders/status
 *       page: "Pagination page number (up to 25 objects per page)."
 *       response: data ("List of orders."), links ("Pagination links."),
 *                 meta ("Pagination metadata.")
 *       "if no orders match the criteria, an empty array is returned."
 *     GET /fulfillment/{countrycode}/v1/orders/{id}/details
 * The page size is fixed upstream (no `limit` parameter), so the caller's
 * pages are cut out of the page-number chain by rows (pageByRows). `meta` has
 * no documented fields for this endpoint (the first-party Postman example
 * shows `"meta": {}`), so the chain ends on the documented empty `data`.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import { NovaPoshtaAdapter } from '../../../../../../src/verticals/logistics/adapters/nova-poshta/index'
import { OrderSchema } from '../../../../../../src/verticals/logistics/schema/order'

const CREDS = { accessToken: 'jwt-a', refreshToken: 'np_key_a', extra: { countryCode: 'pl' } }
const OTHER = { accessToken: 'jwt-b', refreshToken: 'np_key_b', extra: { countryCode: 'pl' } }
const NO_COUNTRY = { accessToken: 'jwt-c', refreshToken: 'np_key_c' }
const STATUS_PATH = 'fulfillment/pl/v1/orders/status'
/** "Pagination page number (up to 25 objects per page)." */
const UPSTREAM = 25
const CALL_BUDGET = 60

type Row = Record<string, unknown>

/**
 * A fake Nova Post fulfillment API that honours ONLY the documented `page`
 * of GET /fulfillment/{countrycode}/v1/orders/status and answers with the
 * documented data/links/meta envelope (links and meta empty, as in the
 * first-party example). `pages` overrides the per-page row counts, for an
 * uneven chain; past the last page `data` is empty.
 */
function fakeFulfillment(count: number, opts: { pages?: number[] } = {}) {
  let calls = 0
  const log: Array<{ token: string; path: string; params: Record<string, unknown> }> = []
  const gets = new Map<string, ReturnType<typeof makeGet>>()

  function pageRows(token: string, page: number): Row[] {
    const tag = token === CREDS.accessToken ? '' : `${token}:`
    const sizes = opts.pages ?? []
    let start: number
    let size: number
    if (opts.pages) {
      start = sizes.slice(0, page - 1).reduce((a, b) => a + b, 0)
      size = sizes[page - 1] ?? 0
    } else {
      start = (page - 1) * UPSTREAM
      size = Math.max(0, Math.min(UPSTREAM, count - start))
    }
    return Array.from({ length: size }, (_, i) => ({
      id: `${tag}o${start + i + 1}`,
      externalNumber: `EXT-${start + i + 1}`,
      destWarehouse: '000063146',
      status: 1,
      statusTime: null,
      waybillNumber: null,
    }))
  }

  function makeGet(token: string) {
    return vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
      const params = Object.fromEntries(
        Object.entries(cfg?.params ?? {}).filter(([, v]) => v !== undefined),
      )
      log.push({ token, path, params })
      if (path !== STATUS_PATH) throw new Error(`unexpected path ${path}`)
      const bad = Object.keys(params).filter((k) => k !== 'page')
      if (bad.length) throw new Error(`422: undocumented params ${bad.join(',')}`)
      const page = params.page === undefined ? 1 : Number(params.page)
      return { data: { data: pageRows(token, page), links: {}, meta: {} } }
    })
  }

  const getFor = (token: string) => {
    let get = gets.get(token)
    if (!get) gets.set(token, (get = makeGet(token)))
    return get
  }

  vi.spyOn(axios, 'create').mockImplementation(((cfg: { headers: Record<string, string> }) => ({
    get: getFor(cfg.headers.Authorization!),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  })) as never)
  return { get: getFor(CREDS.accessToken), log }
}

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)
const byId = (r: { id?: string }): string => r.id ?? '<no id>'
const sentParams = (c: unknown[]) => (c[1] as { params: Record<string, unknown> }).params

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

const adapter = () => new NovaPoshtaAdapter()

describe('nova-poshta listOrders (GET /fulfillment/{countrycode}/v1/orders/status)', () => {
  for (const L of [5, 13]) {
    const N = 2 * L + 1
    it(`N = 2L+1 = ${N} rows: pages 1..3 at limit ${L} return every id once, in order, with exact hasMore`, async () => {
      fakeFulfillment(N)
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (let k = 1; k <= 3; k++) {
        const params = withPageSink({ page: k, limit: L })
        const rows = await adapter().listOrders(CREDS, params)
        for (const r of rows) OrderSchema.parse(r)
        seen.push(...rows.map(byId))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(ids('o', N))
      expect(more).toEqual([true, true, false])
    })
  }

  it('sends only the documented `page` on the documented /v1/ path, and its page moves', async () => {
    const { get } = fakeFulfillment(60)
    const seen: string[] = []
    for (let k = 1; k <= 3; k++) {
      seen.push(
        ...(await adapter().listOrders(CREDS, withPageSink({ page: k, limit: 20 }))).map(byId),
      )
    }
    expect(seen).toEqual(ids('o', 60))
    for (const c of get.mock.calls) {
      expect(c[0]).toBe(STATUS_PATH)
      expect(Object.keys(sentParams(c))).toEqual(['page'])
    }
    expect(get.mock.calls.map((c) => sentParams(c).page)).toEqual([1, 2, 3, 4])
  })

  it('an uneven upstream chain (short pages mid-chain) still serves every id once', async () => {
    const pages = [25, 7, 25, 3]
    const total = pages.reduce((a, b) => a + b, 0)
    fakeFulfillment(0, { pages })
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 6; k++) {
      const params = withPageSink({ page: k, limit: 10 })
      seen.push(...(await adapter().listOrders(CREDS, params)).map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids('o', total))
    expect(more).toEqual([true, true, true, true, true, false])
  })

  it('an exact multiple of the upstream page ends on the documented empty data', async () => {
    const { get } = fakeFulfillment(2 * UPSTREAM)
    const params = withPageSink({ page: 1, limit: 2 * UPSTREAM })
    const rows = await adapter().listOrders(CREDS, params)
    expect(rows.map(byId)).toEqual(ids('o', 2 * UPSTREAM))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(get.mock.calls.map((c) => sentParams(c).page)).toEqual([1, 2, 3])
  })

  it('an empty account returns no rows and hasMore false', async () => {
    fakeFulfillment(0)
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await adapter().listOrders(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeFulfillment(11)
    const params = parseListQuery({ page: '2', limit: '5' })
    const env = listPage(await adapter().listOrders(CREDS, params), params, 'nova-poshta')
    expect(env.data.map(byId)).toEqual(ids('o', 11).slice(5, 10))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: 5, hasMore: true }))
  })

  it('a second connection never reuses the first connection’s rows', async () => {
    const { log } = fakeFulfillment(11)
    await adapter().listOrders(CREDS, withPageSink({ page: 1, limit: 5 }))
    const rows = await adapter().listOrders(OTHER, withPageSink({ page: 2, limit: 5 }))
    expect(rows.map(byId)).toEqual(ids(`${OTHER.accessToken}:o`, 11).slice(5, 10))
    expect(log.filter((c) => c.token === OTHER.accessToken).length).toBeGreaterThan(0)
  })

  it('a body without the required `data` array throws instead of ending the list', async () => {
    const get = vi.fn(async () => ({ data: { links: {}, meta: {} } }))
    vi.spyOn(axios, 'create').mockImplementation((() => ({ get })) as never)
    await expect(adapter().listOrders(CREDS, withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(
      /no `data` array/,
    )
  })

  it('refuses with 501 NOT_SUPPORTED, sending no request, when the connection has no country code', async () => {
    const { log } = fakeFulfillment(11)
    await expect(
      adapter().listOrders(NO_COUNTRY, withPageSink({ page: 1, limit: 5 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    await expect(adapter().listOrders(NO_COUNTRY, { page: 1 })).rejects.toThrow(/countrycode/)
    expect(log).toEqual([])
  })
})

describe('nova-poshta getOrder (GET /fulfillment/{countrycode}/v1/orders/{id}/details)', () => {
  /** The first-party Postman example response for Get Order Details. */
  const EXAMPLE = {
    id: '0123456789',
    externalNumber: 'Num-01',
    details: [
      {
        id: '3279cadb-daeb-4c62-a2fa-8fdb105c85a4',
        objectId: '0102030405',
        sku: 'SKU-001',
        measureUnitName: 'шт',
        plannedQuantity: 4,
        actualQuantity: 0,
        condition: 0,
        series: ['SN-001', 'SN-002', 'SN-003', 'SN-004'],
      },
    ],
  }

  function fakeDetails() {
    const get = vi.fn(async (_path: string, _cfg?: unknown) => ({ data: EXAMPLE }))
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get,
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    })) as never)
    return get
  }

  it('reads the documented /v1/ details path under the connection’s country code', async () => {
    const get = fakeDetails()
    const order = await adapter().getOrder(CREDS, '0123456789')
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe('fulfillment/pl/v1/orders/0123456789/details')
    expect(OrderSchema.parse(order)).toEqual(
      expect.objectContaining({ id: '0123456789', orderNumber: 'Num-01' }),
    )
    expect(order.lineItems).toEqual([
      { id: '3279cadb-daeb-4c62-a2fa-8fdb105c85a4', sku: 'SKU-001', quantity: 4 },
    ])
  })

  it('refuses with 501 NOT_SUPPORTED, sending no request, when the connection has no country code', async () => {
    const get = fakeDetails()
    await expect(adapter().getOrder(NO_COUNTRY, '0123456789')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
  })

  it('refuses with 501, sending no request, when the country code is empty or blank', async () => {
    const get = fakeDetails()
    for (const countryCode of ['', '   ']) {
      const creds = { ...NO_COUNTRY, extra: { countryCode } }
      await expect(adapter().getOrder(creds, '0123456789')).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
      })
      await expect(
        adapter().listOrders(creds, withPageSink({ page: 1, limit: 5 })),
      ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    }
    expect(get).not.toHaveBeenCalled()
  })

  it('trims the country code and percent-encodes the order id in the path', async () => {
    const get = fakeDetails()
    await adapter().getOrder({ ...CREDS, extra: { countryCode: ' pl ' } }, 'a/b?c')
    expect(get.mock.calls[0]![0]).toBe('fulfillment/pl/v1/orders/a%2Fb%3Fc/details')
  })
})
