/**
 * Shipium listOrders / getOrder.
 *
 * searchOrdersV1 — https://docs.shipium.com/reference/searchordersv1.md
 *   "/api/v1/deliveryexperience/order/search": { "get": { ... "operationId": "searchOrdersV1"
 *   query parameters: shipiumTenantId, associatedIdentifiers, fromDate, toDate,
 *   orderStatuses, include, anchor ("Identifier for the current page of data."),
 *   count ("The number results to include on each page of the response").
 *   200 → OrchestratedAssetBatchResults { orchestratedAssetMetadata, results[], failures[] }.
 *
 * Next-page signal — NOT declared on searchOrdersV1, whose 200 lists no headers.
 * The same OpenAPI declares X-Page-Next on the sibling anchor/count searches
 * (searchPackShipOrderOrchestrationV1 GET /api/v1/packShip/order, searchLabelsV1,
 * searchLtlCostsV1): "Anchor to the next page of results. If this is missing, there
 * are no more pages. This should be used in the `anchor` query parameter". The Pack
 * App guide's "Search an order" text documents the packShip search, not this one.
 * The fake below assumes searchOrdersV1 behaves the same; that needs a live check.
 *
 * getOrderV1 — "/api/v1/deliveryexperience/order/{orderId}": { "get": ... "Retrieve an order."
 *
 * Before this rebuild listOrders called GET /orders/search?limit&offset, a path and
 * parameters that appear nowhere in Shipium's docs, and getOrder called GET /order.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { ShipiumAdapter } from '../../../../../../src/verticals/logistics/adapters/shipium/index'
import { OrderSchema } from '../../../../../../src/verticals/logistics/schema/order'

const CREDS = { accessToken: 'shipium-api-key' }
const SEARCH = '/deliveryexperience/order/search'
const DOCUMENTED = new Set([
  'shipiumTenantId',
  'associatedIdentifiers',
  'fromDate',
  'toDate',
  'orderStatuses',
  'include',
  'anchor',
  'count',
])
const CALL_BUDGET = 30
const L = 5
const N = 2 * L + 1

function order(i: number) {
  return {
    shipiumOrderId: `ord-${i}`,
    partnerOrderId: `partner-order:${i}`,
    orderedDateTime: '2025-03-15T10:10:00.111111Z',
    orderItemQuantities: [{ productId: 'SKU-12345', quantity: 3 }],
    destinationAddress: { countryCode: 'US', postalCode: '87121' },
    orderStatus: 'open',
  }
}

/**
 * A fake that honours only searchOrdersV1's documented query parameters. The
 * anchor is opaque (the fake mints `anc-<offset>`), handed out in X-Page-Next and
 * absent on the last page.
 */
function fakeShipium(total: number) {
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    const params = cfg?.params ?? {}
    if (path.startsWith('/deliveryexperience/order/') && path !== SEARCH) {
      if (Object.keys(params).length > 0) throw new Error('400: getOrderV1 takes no query')
      return { data: order(Number(path.split('ord-')[1])), headers: {} }
    }
    if (path !== SEARCH) throw new Error(`404: unexpected path ${path}`)
    for (const k of Object.keys(params)) {
      if (!DOCUMENTED.has(k)) throw new Error(`400: undocumented query param ${k}`)
    }
    const count = Number(params['count'] ?? 20)
    const anchor = params['anchor']
    let start = 0
    if (anchor !== undefined) {
      const m = /^anc-(\d+)$/.exec(String(anchor))
      if (!m) throw new Error(`400: bad anchor ${String(anchor)}`)
      start = Number(m[1])
    }
    const end = Math.min(start + count, total)
    const results = Array.from({ length: end - start }, (_, i) => order(start + i + 1))
    const headers: Record<string, string> = { 'x-total-count': String(total) }
    if (end < total) headers['x-page-next'] = `anc-${end}`
    return {
      data: {
        orchestratedAssetMetadata: { orchestrationId: 'o', orchestrationTimeStamp: 't' },
        results,
        failures: [],
      },
      headers,
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(async () => {
      throw new Error('no POST expected')
    }),
    put: vi.fn(),
    delete: vi.fn(),
  } as never)
  return { get }
}

const ids = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => `ord-${from + i}`)

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('shipium listOrders (searchOrdersV1)', () => {
  const adapter = () => new ShipiumAdapter()

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, with exact hasMore', async () => {
    fakeShipium(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await adapter().listOrders(CREDS, params)
      rows.forEach((r) => OrderSchema.parse(r))
      seen.push(...rows.map((r) => r.id as string))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(1, N))
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })

  it('page 1 calls the documented path with count = limit and no anchor', async () => {
    const { get } = fakeShipium(N)
    await adapter().listOrders(CREDS, withPageSink({ page: 1, limit: L }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe(SEARCH)
    expect(get.mock.calls[0]![1]?.params).toEqual({ count: L })
  })

  it('a later page sends the anchor from the previous X-Page-Next', async () => {
    const { get } = fakeShipium(N)
    await adapter().listOrders(CREDS, withPageSink({ page: 2, limit: L }))
    expect(get.mock.calls.map((c) => c[1]?.params)).toEqual([
      { count: L },
      { count: L, anchor: `anc-${L}` },
    ])
  })

  it('sequential pages reuse the remembered anchor: one request per page', async () => {
    const { get } = fakeShipium(N)
    for (let k = 1; k <= 3; k++)
      await adapter().listOrders(CREDS, withPageSink({ page: k, limit: L }))
    expect(get).toHaveBeenCalledTimes(3)
  })

  it('a missing X-Page-Next ends the collection: a page past it is empty', async () => {
    fakeShipium(L)
    const p1 = withPageSink({ page: 1, limit: L })
    expect(await adapter().listOrders(CREDS, p1)).toHaveLength(L)
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    const p2 = withPageSink({ page: 2, limit: L })
    expect(await adapter().listOrders(CREDS, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('an empty X-Page-Next is not an anchor: the page is the last one', async () => {
    const { get } = fakeShipium(N)
    get.mockImplementationOnce(
      async () =>
        ({
          data: { results: [order(1)], failures: [] },
          headers: { 'x-page-next': '' },
        }) as never,
    )
    const p1 = withPageSink({ page: 1, limit: L })
    expect((await adapter().listOrders(CREDS, p1)).map((r) => r.id)).toEqual(['ord-1'])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
  })

  it('an anchor minted at one count is not replayed at another', async () => {
    const { get } = fakeShipium(N)
    await adapter().listOrders(CREDS, withPageSink({ page: 1, limit: L }))
    const rows = await adapter().listOrders(CREDS, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((r) => r.id)).toEqual(ids(4, 3))
    expect(get.mock.calls.slice(1).map((c) => c[1]?.params)).toEqual([
      { count: 3 },
      { count: 3, anchor: 'anc-3' },
    ])
  })

  it('does not pass search, cursor or offset through', async () => {
    const { get } = fakeShipium(N)
    await adapter().listOrders(
      CREDS,
      withPageSink({ page: 1, limit: L, search: 'x', cursor: '7' } as never),
    )
    expect(get.mock.calls[0]![1]?.params).toEqual({ count: L })
  })
})

describe('shipium getOrder (getOrderV1)', () => {
  it('reads GET /deliveryexperience/order/{orderId}, so a listed id reads back', async () => {
    const { get } = fakeShipium(N)
    const [first] = await new ShipiumAdapter().listOrders(
      CREDS,
      withPageSink({ page: 1, limit: 1 }),
    )
    const o = await new ShipiumAdapter().getOrder(CREDS, first!.id as string)
    expect(get.mock.calls[1]![0]).toBe('/deliveryexperience/order/ord-1')
    expect(OrderSchema.parse(o).id).toBe('ord-1')
  })
})
