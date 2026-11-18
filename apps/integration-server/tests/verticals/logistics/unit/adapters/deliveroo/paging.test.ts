/**
 * Deliveroo list paging. listOrders and listWarehouses ignored the caller's
 * `page`, so page 2 repeated page 1.
 *
 * GET /order/v2/brand/{brand_id}/restaurant/{restaurant_id}/orders is
 * cursor-paged. First-party docs, https://api-docs.deliveroo.com/reference/get-orders-v2:
 *   cursor: "A cursor to retrieve the next page of results. This is returned
 *            in the `next` field of response for the previous page of results."
 *   next (response): "Cursor for the next page if there are more than 100 orders"
 * No page-size parameter exists, so one upstream page is up to 100 orders and
 * the adapter cuts caller pages out of the cursor chain by rows.
 *
 * GET /signature/v1/restaurants takes no paging parameters
 * (https://api-docs.deliveroo.com/reference/get-restaurants: "A list of
 * Restaurants that deliver to the specified location."), so the caller's page
 * is sliced from the whole list.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import { DeliverooAdapter } from '../../../../../../src/verticals/logistics/adapters/deliveroo/index'

const CREDS = { accessToken: 'deliveroo_test_token' }
const CALL_BUDGET = 60
const L = 5
const N = 2 * L + 1
/** Orders per upstream page, per the docs' "more than 100 orders". */
const UPSTREAM = 100
const ORDER_KEYS = new Set(['start_date', 'end_date', 'cursor', 'live_orders'])
const RESTAURANT_KEYS = new Set([
  'lat',
  'lon',
  'postcode',
  'brand_id',
  'country_code',
  'include_test_sites',
])
const ORDERS_PATH = '/order/v2/brand/b1/restaurant/r1/orders'

/**
 * A fake Deliveroo that honours ONLY the documented query params: orders come
 * 100 to a page with an opaque `next` cursor; restaurants come all at once.
 */
function fakeDeliveroo(orders: number, restaurants = 0) {
  let calls = 0
  const orderRows = Array.from({ length: orders }, (_, i) => ({
    id: `o${i + 1}`,
    status: 'placed',
  }))
  const restaurantRows = Array.from({ length: restaurants }, (_, i) => ({
    id: `r${i + 1}`,
    name: `Site ${i + 1}`,
  }))
  const cursorFor = (offset: number) => Buffer.from(`off:${offset}`).toString('base64')
  const offsetOf = (c: string) => {
    const m = /^off:(\d+)$/.exec(Buffer.from(c, 'base64').toString())
    if (!m) throw new Error('400: bad cursor')
    return Number(m[1])
  }
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    const params = Object.fromEntries(
      Object.entries(cfg?.params ?? {}).filter(([, v]) => v !== undefined),
    )
    if (path === ORDERS_PATH) {
      const bad = Object.keys(params).filter((k) => !ORDER_KEYS.has(k))
      if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
      const start = params.cursor === undefined ? 0 : offsetOf(String(params.cursor))
      const page = orderRows.slice(start, start + UPSTREAM)
      const more = start + UPSTREAM < orderRows.length
      return { data: more ? { orders: page, next: cursorFor(start + UPSTREAM) } : { orders: page } }
    }
    if (path === '/signature/v1/restaurants') {
      const bad = Object.keys(params).filter((k) => !RESTAURANT_KEYS.has(k))
      if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
      return { data: { restaurants: restaurantRows } }
    }
    throw new Error(`unexpected path ${path}`)
  })
  vi.spyOn(axios, 'create').mockImplementation((() => ({ get, post: vi.fn() })) as never)
  return { get }
}

const ids = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`)
const byId = (r: { id?: string }): string => r.id ?? '<no id>'
const scope = { brandId: 'b1', restaurantId: 'r1' }

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

describe('deliveroo listOrders paging', () => {
  const adapter = () => new DeliverooAdapter()

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeDeliveroo(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L, ...scope })
      seen.push(...(await adapter().listOrders(CREDS, params)).map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(N, 'o'))
    expect(more).toEqual([true, true, false])
  })

  it('walks past the first upstream page of 100 orders', async () => {
    fakeDeliveroo(250)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 90, ...scope })
      seen.push(...(await adapter().listOrders(CREDS, params)).map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(250, 'o'))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented cursor key', async () => {
    const { get } = fakeDeliveroo(250)
    await adapter().listOrders(CREDS, withPageSink({ page: 1, limit: UPSTREAM, ...scope }))
    await adapter().listOrders(CREDS, withPageSink({ page: 2, limit: UPSTREAM, ...scope }))
    const last = get.mock.calls.at(-1)!
    expect(last[0]).toBe(ORDERS_PATH)
    expect(typeof (last[1] as { params: Record<string, unknown> }).params.cursor).toBe('string')
  })

  it('a limit above the maximum is clamped', async () => {
    fakeDeliveroo(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    const rows = await adapter().listOrders(CREDS, { ...params, ...scope })
    expect(rows.map(byId)).toEqual(ids(N, 'o'))
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeDeliveroo(N)
    const params = Object.assign(parseListQuery({ page: '2', limit: String(L) }), scope)
    const env = listPage(await adapter().listOrders(CREDS, params), params, 'deliveroo')
    expect(env.data.map(byId)).toEqual(ids(N, 'o').slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })
})

describe('deliveroo listWarehouses paging', () => {
  const adapter = () => new DeliverooAdapter()

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeDeliveroo(0, N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listWarehouses(CREDS, params)).map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(N, 'r'))
    expect(more).toEqual([true, true, false])
  })

  it('sends no paging parameter (the endpoint documents none)', async () => {
    const { get } = fakeDeliveroo(0, N)
    await adapter().listWarehouses(CREDS, withPageSink({ page: 2, limit: L }))
    const sent = (get.mock.calls.at(-1)![1] as { params: Record<string, unknown> }).params
    expect(Object.keys(sent).filter((k) => sent[k] !== undefined)).toEqual([])
  })

  it('a limit above the maximum is clamped', async () => {
    fakeDeliveroo(0, N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    const rows = await adapter().listWarehouses(CREDS, params)
    expect(rows.map(byId)).toEqual(ids(N, 'r'))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeDeliveroo(0, N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listWarehouses(CREDS, params), params, 'deliveroo')
    expect(env.data.map(byId)).toEqual(ids(N, 'r').slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })
})

/**
 * A fake whose orders differ per connection (bearer token), per restaurant and
 * per start_date, so a row-pager key that loses any of them serves another
 * walk's rows. Each row id is `<token>|<restaurant>|<start_date>|o<n>`.
 */
function fakeScopedDeliveroo(orders: number) {
  let calls = 0
  const cursorFor = (offset: number) => Buffer.from(`off:${offset}`).toString('base64')
  const sent: Array<{ path: string; params: Record<string, unknown> }> = []
  vi.spyOn(axios, 'create').mockImplementation(((cfg?: { headers?: Record<string, string> }) => {
    const token = String(cfg?.headers?.Authorization ?? '').replace(/^Bearer /, '')
    const get = vi.fn(async (path: string, c?: { params?: Record<string, unknown> }) => {
      if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
      const params = Object.fromEntries(
        Object.entries(c?.params ?? {}).filter(([, v]) => v !== undefined),
      )
      sent.push({ path, params })
      const m = /^\/order\/v2\/brand\/b1\/restaurant\/([^/]+)\/orders$/.exec(path)
      if (!m) throw new Error(`unexpected path ${path}`)
      const bad = Object.keys(params).filter((k) => !ORDER_KEYS.has(k))
      if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
      const tag = `${token}|${m[1]}|${String(params.start_date ?? '-')}`
      let start = 0
      if (params.cursor !== undefined) {
        const cm = /^off:(\d+)$/.exec(Buffer.from(String(params.cursor), 'base64').toString())
        if (!cm) throw new Error('400: bad cursor')
        start = Number(cm[1])
      }
      const end = Math.min(start + UPSTREAM, orders)
      const page = Array.from({ length: end - start }, (_, i) => ({
        id: `${tag}|o${start + i + 1}`,
        status: 'placed',
      }))
      return { data: end < orders ? { orders: page, next: cursorFor(end) } : { orders: page } }
    })
    return { get, post: vi.fn() }
  }) as never)
  return { sent, cursorFor }
}

const tagged = (tag: string, from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => `${tag}|o${from + i + 1}`)

describe('deliveroo listOrders row-pager key', () => {
  const adapter = () => new DeliverooAdapter()
  const page = (k: number, extra: Record<string, unknown>) =>
    withPageSink({ page: k, limit: L, brandId: 'b1', ...extra })

  it("is per connection: page 2 on connection B is B's rows after page 1 on connection A", async () => {
    fakeScopedDeliveroo(N)
    await adapter().listOrders({ accessToken: 'tokA' }, page(1, { restaurantId: 'r1' }))
    const rows = await adapter().listOrders(
      { accessToken: 'tokB' },
      page(2, { restaurantId: 'r1' }),
    )
    expect(rows.map(byId)).toEqual(tagged('tokB|r1|-', L, 2 * L))
  })

  it("is per restaurant: page 2 for r2 is r2's rows after page 1 for r1", async () => {
    fakeScopedDeliveroo(N)
    await adapter().listOrders(CREDS, page(1, { restaurantId: 'r1' }))
    const rows = await adapter().listOrders(CREDS, page(2, { restaurantId: 'r2' }))
    expect(rows.map(byId)).toEqual(tagged(`${CREDS.accessToken}|r2|-`, L, 2 * L))
  })

  it("is per date filter: page 2 for start_date B is B's rows after page 1 for start_date A", async () => {
    fakeScopedDeliveroo(N)
    await adapter().listOrders(CREDS, page(1, { restaurantId: 'r1', startDate: '2026-01-01' }))
    const rows = await adapter().listOrders(
      CREDS,
      page(2, { restaurantId: 'r1', startDate: '2026-02-01' }),
    )
    expect(rows.map(byId)).toEqual(tagged(`${CREDS.accessToken}|r1|2026-02-01`, L, 2 * L))
  })

  it('sends start_date and end_date upstream on every page of the walk', async () => {
    const { sent } = fakeScopedDeliveroo(250)
    const filters = { restaurantId: 'r1', startDate: '2026-01-01', endDate: '2026-01-31' }
    await adapter().listOrders(
      CREDS,
      withPageSink({ page: 2, limit: 150, brandId: 'b1', ...filters }),
    )
    expect(sent.length).toBeGreaterThanOrEqual(2)
    for (const s of sent) {
      expect(s.params).toEqual(
        expect.objectContaining({ start_date: '2026-01-01', end_date: '2026-01-31' }),
      )
    }
  })
})

describe('deliveroo listOrders explicit cursor', () => {
  it("returns exactly the upstream page at the caller's cursor, with the filters", async () => {
    const { sent, cursorFor } = fakeScopedDeliveroo(250)
    const rows = await new DeliverooAdapter().listOrders(
      CREDS,
      withPageSink({
        page: 1,
        limit: L,
        brandId: 'b1',
        restaurantId: 'r1',
        startDate: '2026-01-01',
        cursor: cursorFor(100),
      }),
    )
    expect(rows.map(byId)).toEqual(tagged(`${CREDS.accessToken}|r1|2026-01-01`, 100, 200))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.params).toEqual({ start_date: '2026-01-01', cursor: cursorFor(100) })
  })
})
