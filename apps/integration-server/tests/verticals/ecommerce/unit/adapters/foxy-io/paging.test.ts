/**
 * Foxy.io list paging.
 *
 * Foxy's hAPI pages every collection by offset
 * (https://api.foxycart.com/docs/cheat-sheet):
 *   "You can also control the number of results per page with a URL parameter
 *   of limit=<limit>. You can also specify a starting offset for the results
 *   with a URL parameter of offset=<offset>. The API returns 20 items per page
 *   by default, and currently the maximum results per page is 300."
 *
 * Before this, every list sent `offset=params.offset ?? 0` and never read
 * `page`, so page 2 re-sent offset 0 and served page 1 again. Customers,
 * orders and discounts are one upstream row per caller row, so they forward
 * `pageOffset(params, limit)`. Fulfillments are shipments flattened out of
 * transactions (0..n per transaction), so they are cut by `pageByRows` over
 * the transaction pages.
 *
 * The fake below serves only the documented parameters, `limit`, `offset` and
 * `zoom`, silently clamps `limit` to 300 as the platform does, and answers
 * with the HAL envelope (`total_items`, `returned_items`, `offset`, `limit`,
 * `_embedded`, `_links.next`).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { FoxyIoAdapter } from '../../../../../../src/verticals/ecommerce/adapters/foxy-io/index'

const STORE = '42'
const MAX = 300
const DOCUMENTED = new Set(['limit', 'offset', 'zoom'])
/**
 * The filter the adapter sends today for `updatedAfter`. It is NOT in the
 * cheat sheet (which documents field ranges, `date_modified=<a>..<b>`); the
 * fake honours it only so that filter flow through paging is pinned. Whether
 * Foxy honours it is a separate, reported finding.
 */
const ADAPTER_FILTER = 'date_modified_after'

let tokenSeq = 0
/** A fresh connection per test, so the row pager never shares a walk across tests. */
const creds = () => ({ accessToken: `foxy_test_${++tokenSeq}` })

type Row = { id: number; date_modified?: string; _embedded?: Record<string, unknown[]> }

/**
 * A fake Foxy store. `collections` maps a store resource (`customers`,
 * `transactions`, `coupons`) to its rows in order. `orders` serves single
 * `GET /transactions/{id}` reads.
 */
function fakeFoxy(collections: Record<string, Row[]>, orders: Record<string, Row> = {}) {
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    const extra = Object.keys(params).filter((k) => !DOCUMENTED.has(k) && k !== ADAPTER_FILTER)
    if (extra.length > 0) throw new Error(`undocumented query parameter(s): ${extra.join(', ')}`)
    const one = /^\/transactions\/(\d+)$/.exec(path)
    if (one) {
      const order = orders[one[1]!]
      if (!order) throw new Error(`no order ${one[1]}`)
      return { data: order }
    }
    const coupon = /^\/coupons\/(\d+)\/coupon_codes$/.exec(path)
    if (coupon)
      return {
        data: {
          total_items: 0,
          returned_items: 0,
          offset: 0,
          limit: 1,
          _embedded: { 'fx:coupon_codes': [] },
        },
      }
    const m = new RegExp(`^/stores/${STORE}/(\\w+)$`).exec(path)
    if (!m) throw new Error(`unexpected path ${path}`)
    const resource = m[1]!
    const all = collections[resource]
    if (!all) throw new Error(`no collection ${resource}`)
    const after = params[ADAPTER_FILTER] as string | undefined
    const rows = after === undefined ? all : all.filter((r) => (r.date_modified ?? '') >= after)
    const limit = Math.min(Number(params.limit ?? 20), MAX)
    const offset = Number(params.offset ?? 0)
    const page = rows.slice(offset, offset + limit)
    const links: Record<string, { href: string }> = {}
    if (offset + page.length < rows.length)
      links.next = {
        href: `https://api.foxycart.com${path}?limit=${limit}&offset=${offset + limit}`,
      }
    return {
      data: {
        total_items: rows.length,
        returned_items: page.length,
        offset,
        limit,
        _embedded: { [`fx:${resource}`]: page },
        _links: links,
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as never)
  return { get }
}

const flat = (n: number, base = 1000): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: base + i }))

/** Transactions holding `n` shipments in all, spread 0..3 per transaction. */
function transactionsWithShipments(n: number): { txns: Row[]; ids: string[] } {
  const spread = [0, 2, 1, 0, 3, 1]
  const txns: Row[] = []
  const ids: string[] = []
  let sid = 5000
  let t = 0
  while (ids.length < n) {
    const want = Math.min(spread[t % spread.length]!, n - ids.length)
    const shipments = Array.from({ length: want }, () => ({ id: sid++ }))
    ids.push(...shipments.map((s) => String(s.id)))
    txns.push({ id: 9000 + t, _embedded: { 'fx:shipments': shipments } })
    t++
  }
  // A trailing transaction without shipments: the stream does not end on a row.
  txns.push({ id: 9000 + t, _embedded: { 'fx:shipments': [] } })
  return { txns, ids }
}

afterEach(() => vi.restoreAllMocks())

const adapter = () =>
  new FoxyIoAdapter({
    clientId: 'c',
    clientSecret: 's',
    redirectUri: 'https://x/cb',
    storeId: STORE,
  })

type Method = 'listCustomers' | 'listOrders' | 'listDiscounts' | 'listFulfillments'

/** Build the fake for `method` holding `n` rows, returning the expected ids in order. */
function setup(method: Method, n: number) {
  if (method === 'listFulfillments') {
    const { txns, ids } = transactionsWithShipments(n)
    return { ...fakeFoxy({ transactions: txns }), ids }
  }
  const resource = {
    listCustomers: 'customers',
    listOrders: 'transactions',
    listDiscounts: 'coupons',
  }[method]
  const rows = flat(n)
  return { ...fakeFoxy({ [resource]: rows }), ids: rows.map((r) => String(r.id)) }
}

const METHODS: Method[] = ['listCustomers', 'listOrders', 'listDiscounts', 'listFulfillments']

describe('foxy-io list paging', () => {
  it('declares the documented maximum of 300', () => {
    expect(adapter().capabilities?.maxPageSize).toBe(MAX)
  })

  describe.each(METHODS)('%s', (method) => {
    it.each([1, 3, 7])(
      'N = 2L+1 at limit %i: pages 1..3 serve every id once, hasMore exact',
      async (L) => {
        const { ids } = setup(method, 2 * L + 1)
        const c = creds()
        const seen: string[] = []
        const hasMore: Array<boolean | undefined> = []
        for (let k = 1; k <= 3; k++) {
          const params = withPageSink({ page: k, limit: L })
          const rows = await adapter()[method](c, params)
          expect(rows.length).toBe(k < 3 ? L : 1)
          seen.push(...rows.map((r) => r.id))
          hasMore.push(readUpstreamPage(params)?.hasMore)
        }
        expect(seen).toEqual(ids)
        expect(hasMore).toEqual([true, true, false])
      },
    )

    it('the page-2 request carries the documented offset', async () => {
      const L = 3
      const { get } = setup(method, 2 * L + 1)
      // A fresh connection, so the row pager cannot answer from a remembered walk.
      await adapter()[method](creds(), withPageSink({ page: 2, limit: L }))
      const listCalls = get.mock.calls.filter(([p]) => String(p).startsWith(`/stores/${STORE}/`))
      expect(listCalls.length).toBeGreaterThan(0)
      const offsets = listCalls.map(([, cfg]) => Number(cfg?.params?.offset))
      if (method === 'listFulfillments') {
        // Shipments are cut from transaction pages of L; reaching caller page 2
        // walks the transaction pages by offset, 0, L, 2L...
        expect(offsets.slice(0, 2)).toEqual([0, L])
        expect(listCalls.every(([, cfg]) => cfg?.params?.limit === L)).toBe(true)
      } else {
        expect(offsets).toEqual([L])
        expect(listCalls[0]![1]?.params?.limit).toBe(L)
      }
    })

    it('a limit above 300 is clamped and still serves every row once', async () => {
      const { ids } = setup(method, 2 * MAX + 1)
      const c = creds()
      const seen: string[] = []
      let more = true
      for (let k = 1; more && k <= 10; k++) {
        const params = withPageSink({ page: k, limit: 500 })
        const rows = await adapter()[method](c, params)
        seen.push(...rows.map((r) => r.id))
        more = readUpstreamPage(params)?.hasMore === true
      }
      expect(more).toBe(false)
      expect(seen).toEqual(ids)
    })

    it('through the API path, parseListQuery then listPage gives the right meta.hasMore', async () => {
      setup(method, 5)
      const c = creds()
      const p1: QueryParams = withPageSink(parseListQuery({ page: '1', limit: '2' }))
      const env1 = listPage<{ id: string }>(await adapter()[method](c, p1), p1, 'foxy-io')
      expect(env1.data).toHaveLength(2)
      expect(env1.meta.hasMore).toBe(true)
      const p3: QueryParams = withPageSink(parseListQuery({ page: '3', limit: '2' }))
      const env3 = listPage<{ id: string }>(await adapter()[method](c, p3), p3, 'foxy-io')
      expect(env3.data).toHaveLength(1)
      expect(env3.meta.hasMore).toBe(false)
    })
  })
})

const OLD = '2026-01-01T00:00:00.000Z'
const NEW = '2026-06-01T00:00:00.000Z'
const CUTOFF = new Date('2026-03-01T00:00:00.000Z')
/** Stamp every other row as modified after CUTOFF (index 1, 3, 5...). */
const stamp = (rows: Row[]): Row[] =>
  rows.map((r, i) => ({ ...r, date_modified: i % 2 === 1 ? NEW : OLD }))

describe('foxy-io list paging: filters, reported meta, connections', () => {
  describe.each(METHODS)('%s under updatedAfter', (method) => {
    it('sends the filter on every list request and walks only the filtered rows', async () => {
      const L = 2
      let expected: string[]
      let get: ReturnType<typeof fakeFoxy>['get']
      if (method === 'listFulfillments') {
        const { txns } = transactionsWithShipments(12)
        const stamped = stamp(txns)
        expected = stamped
          .filter((t) => t.date_modified === NEW)
          .flatMap((t) => (t._embedded?.['fx:shipments'] as Row[]).map((s) => String(s.id)))
        ;({ get } = fakeFoxy({ transactions: stamped }))
      } else {
        const resource = {
          listCustomers: 'customers',
          listOrders: 'transactions',
          listDiscounts: 'coupons',
        }[method]
        const rows = stamp(flat(9))
        expected = rows.filter((r) => r.date_modified === NEW).map((r) => String(r.id))
        ;({ get } = fakeFoxy({ [resource]: rows }))
      }
      const c = creds()
      const seen: string[] = []
      let more = true
      for (let k = 1; more && k <= 10; k++) {
        const params = withPageSink({ page: k, limit: L, updatedAfter: CUTOFF })
        const rows = await adapter()[method](c, params)
        seen.push(...rows.map((r) => r.id))
        more = readUpstreamPage(params)?.hasMore === true
      }
      expect(seen).toEqual(expected)
      const listCalls = get.mock.calls.filter(([p]) => String(p).startsWith(`/stores/${STORE}/`))
      expect(listCalls.length).toBeGreaterThan(0)
      expect(
        listCalls.every(([, cfg]) => cfg?.params?.[ADAPTER_FILTER] === CUTOFF.toISOString()),
      ).toBe(true)
    })
  })

  it('listFulfillments keeps a filtered walk apart from an unfiltered one on the same connection', async () => {
    const L = 3
    const { txns } = transactionsWithShipments(20)
    const stamped = stamp(txns)
    const filteredIds = stamped
      .filter((t) => t.date_modified === NEW)
      .flatMap((t) => (t._embedded?.['fx:shipments'] as Row[]).map((s) => String(s.id)))
    fakeFoxy({ transactions: stamped })
    const c = creds()
    // Warm an unfiltered walk through caller page 1.
    await adapter().listFulfillments(c, withPageSink({ page: 1, limit: L }))
    // Page 2 under a filter must be the filtered walk's page 2, not the unfiltered one's.
    const rows = await adapter().listFulfillments(
      c,
      withPageSink({ page: 2, limit: L, updatedAfter: CUTOFF }),
    )
    expect(rows.map((r) => r.id)).toEqual(filteredIds.slice(L, 2 * L))
  })

  it('listFulfillments keeps two connections on one store apart', async () => {
    const L = 3
    const a = transactionsWithShipments(9)
    fakeFoxy({ transactions: a.txns })
    await adapter().listFulfillments(creds(), withPageSink({ page: 1, limit: L }))
    // A second connection to the same store id, seeing different data.
    const b = transactionsWithShipments(9)
    const bTxns = b.txns.map((t) => ({
      ...t,
      _embedded: {
        'fx:shipments': (t._embedded?.['fx:shipments'] as Row[]).map((s) => ({ id: s.id + 100 })),
      },
    }))
    const { get } = fakeFoxy({ transactions: bTxns })
    const rows = await adapter().listFulfillments(creds(), withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(
      b.ids.slice(L, 2 * L).map((id) => String(Number(id) + 100)),
    )
    expect(Number(get.mock.calls[0]?.[1]?.params?.offset)).toBe(0)
  })

  describe.each(['listCustomers', 'listOrders', 'listDiscounts'] as const)(
    '%s reported meta',
    (method) => {
      it('reports Foxy total_items as totalCount', async () => {
        setup(method, 7)
        const params = withPageSink({ page: 1, limit: 3 })
        await adapter()[method](creds(), params)
        expect(readUpstreamPage(params)?.totalCount).toBe(7)
      })

      it('reports the clamped page size only when the limit was clamped', async () => {
        setup(method, 7)
        const clamped = withPageSink({ page: 1, limit: 500 })
        await adapter()[method](creds(), clamped)
        expect(readUpstreamPage(clamped)?.pageSize).toBe(MAX)
        const exact = withPageSink({ page: 1, limit: 3 })
        await adapter()[method](creds(), exact)
        expect(readUpstreamPage(exact)?.pageSize).toBeUndefined()
      })
    },
  )

  it('listFulfillments without a limit serves Foxy’s default of 20 per page', async () => {
    const { ids, get } = setup('listFulfillments', 25)
    const c = creds()
    const p1 = withPageSink({ page: 1 })
    const r1 = await adapter().listFulfillments(c, p1)
    expect(r1.map((r) => r.id)).toEqual(ids.slice(0, 20))
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    const p2 = withPageSink({ page: 2 })
    const r2 = await adapter().listFulfillments(c, p2)
    expect(r2.map((r) => r.id)).toEqual(ids.slice(20))
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
    expect(get.mock.calls.every(([, cfg]) => cfg?.params?.limit === 20)).toBe(true)
  })

  describe('listTransactions (one order’s embedded payments)', () => {
    const ORDER = '777'
    const payments = Array.from({ length: 5 }, (_, i) => ({
      id: 3000 + i,
      transaction_id: Number(ORDER),
      amount: '1.00',
      status: 'approved',
    }))
    const order: Row = { id: Number(ORDER), _embedded: { 'fx:payments': payments } }

    it('pages the embedded payments locally: pages 1..3 serve every id once, hasMore exact', async () => {
      fakeFoxy({}, { [ORDER]: order })
      const c = creds()
      const seen: string[] = []
      const meta: Array<ReturnType<typeof readUpstreamPage>> = []
      for (let k = 1; k <= 3; k++) {
        const params = withPageSink({ page: k, limit: 2, orderId: ORDER })
        const rows = await adapter().listTransactions(c, params)
        expect(rows.length).toBe(k < 3 ? 2 : 1)
        seen.push(...rows.map((r) => r.id))
        meta.push(readUpstreamPage(params))
      }
      expect(seen).toEqual(payments.map((p) => String(p.id)))
      expect(meta.map((m) => m?.hasMore)).toEqual([true, true, false])
      expect(meta.every((m) => m?.pagedLocally === true && m?.totalCount === 5)).toBe(true)
    })

    it('without a limit serves the whole embed', async () => {
      fakeFoxy({}, { [ORDER]: order })
      const params = withPageSink({ orderId: ORDER })
      const rows = await adapter().listTransactions(creds(), params)
      expect(rows).toHaveLength(5)
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })
  })
})
