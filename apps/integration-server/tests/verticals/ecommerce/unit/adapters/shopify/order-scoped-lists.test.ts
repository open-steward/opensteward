/**
 * Second Shopify sync job (2bfaf606-…), after the page-cap fix: products,
 * variants, collections, locations and inventory levels synced; then
 *
 *   fulfillments:  Error: listFulfillments requires `order_id` in query params
 *   refunds:       Error: listRefunds requires `order_id` in query params
 *   transactions:  Error: listTransactions requires `order_id` in query params
 *   discounts:     Circuit breaker opened during sync   (never attempted)
 *
 * Same defect class as inventory levels (`sync-page-cap.test.ts`): Shopify
 * addresses these under an order and has no store-wide list; the sync worker
 * lists every collection unfiltered. The Order payload embeds `fulfillments[]`
 * and `refunds[]` in full, so those two come from one page of orders with no
 * further requests; transactions are not embedded and cost one request per
 * order on that page.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { ShopifyAdapter } from '../../../../../../src/verticals/ecommerce/adapters/shopify/index'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/ecommerce/shopify/callback',
}
const CREDS = { accessToken: 'tok', extra: { shop: 'acme' } }

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

function fakeHttp(
  answer: (path: string, params: Record<string, unknown> | undefined) => unknown,
  calls: Call[] = [],
) {
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    calls.push({ path, params: cfg?.params })
    return { data: answer(path, cfg?.params), headers: {} }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { get, calls }
}

afterEach(() => vi.restoreAllMocks())

const FULFILLMENT = (id: number, order_id: number) => ({
  id,
  order_id,
  status: 'success',
  tracking_number: `T${id}`,
  line_items: [],
  created_at: '2026-09-12T00:00:00Z',
  updated_at: '2026-09-12T00:00:00Z',
})
const REFUND = (id: number, order_id: number) => ({
  id,
  order_id,
  refund_line_items: [],
  transactions: [],
  created_at: '2026-09-12T00:00:00Z',
})

/** Three orders: two with embedded fulfillments/refunds, one with none. */
const ORDERS = [
  {
    id: 101,
    currency: 'NOK',
    fulfillments: [FULFILLMENT(1, 101), FULFILLMENT(2, 101)],
    refunds: [REFUND(11, 101)],
  },
  { id: 102, currency: 'NOK', fulfillments: [], refunds: [] },
  { id: 103, currency: 'NOK', fulfillments: [FULFILLMENT(3, 103)], refunds: [REFUND(12, 103)] },
]

describe('fulfillments without an order', () => {
  it('come from one page of orders, flattened, with no per-order requests', async () => {
    const { calls } = fakeHttp((path) => {
      if (path === 'orders.json') return { orders: ORDERS }
      throw new Error('unexpected ' + path)
    })
    const out = await new ShopifyAdapter(CFG).listFulfillments(CREDS, { limit: 500 })
    expect(out.map((f) => f.id)).toEqual(['1', '2', '3'])
    expect(out.map((f) => f.orderId)).toEqual(['101', '101', '103'])
    expect(calls.map((c) => c.path)).toEqual(['orders.json'])
    // Every order counts, not just open ones; and the page cap holds.
    expect(calls[0].params?.status).toBe('any')
    expect(calls[0].params?.limit).toBe(250)
  })

  it('are empty, not an error, for a store with no orders', async () => {
    const { calls } = fakeHttp(() => ({ orders: [] }))
    await expect(new ShopifyAdapter(CFG).listFulfillments(CREDS, {})).resolves.toEqual([])
    expect(calls.map((c) => c.path)).toEqual(['orders.json'])
  })

  it('still go straight to the order when one is named', async () => {
    const { calls } = fakeHttp(() => ({ fulfillments: [FULFILLMENT(9, 7)] }))
    const out = await new ShopifyAdapter(CFG).listFulfillments(CREDS, { order_id: '7' } as never)
    expect(out.map((f) => f.id)).toEqual(['9'])
    expect(calls.map((c) => c.path)).toEqual(['orders/7/fulfillments.json'])
  })
})

describe('refunds without an order', () => {
  it('come from the same page of orders, in the order’s currency', async () => {
    const { calls } = fakeHttp((path) => {
      if (path === 'orders.json') return { orders: ORDERS }
      throw new Error('unexpected ' + path)
    })
    const out = await new ShopifyAdapter(CFG).listRefunds(CREDS, {})
    expect(out.map((r) => r.id)).toEqual(['11', '12'])
    expect(out.map((r) => r.orderId)).toEqual(['101', '103'])
    expect(calls.map((c) => c.path)).toEqual(['orders.json'])
  })

  it('still go straight to the order when one is named', async () => {
    const { calls } = fakeHttp(() => ({ refunds: [REFUND(5, 7)] }))
    await new ShopifyAdapter(CFG).listRefunds(CREDS, { order_id: '7' } as never)
    expect(calls.map((c) => c.path)).toEqual(['orders/7/refunds.json'])
  })
})

describe('transactions without an order', () => {
  it('enumerate the page of orders and ask each order, in order', async () => {
    const { calls } = fakeHttp((path) => {
      if (path === 'orders.json') return { orders: ORDERS }
      const m = path.match(/^orders\/(\d+)\/transactions\.json$/)
      if (m) {
        return {
          transactions: [
            { id: Number(m[1]) * 10, order_id: Number(m[1]), kind: 'sale', status: 'success', amount: '1.00', currency: 'NOK', created_at: '2026-09-12T00:00:00Z' },
          ],
        }
      }
      throw new Error('unexpected ' + path)
    })
    const out = await new ShopifyAdapter(CFG).listTransactions(CREDS, { limit: 250 })
    expect(calls.map((c) => c.path)).toEqual([
      'orders.json',
      'orders/101/transactions.json',
      'orders/102/transactions.json',
      'orders/103/transactions.json',
    ])
    expect(out.map((t) => t.id)).toEqual(['1010', '1020', '1030'])
    expect(out.map((t) => t.orderId)).toEqual(['101', '102', '103'])
  })

  it('are empty, not an error, for a store with no orders', async () => {
    const { calls } = fakeHttp(() => ({ orders: [] }))
    await expect(new ShopifyAdapter(CFG).listTransactions(CREDS, {})).resolves.toEqual([])
    expect(calls.map((c) => c.path)).toEqual(['orders.json'])
  })

  it('still go straight to the order when one is named', async () => {
    const { calls } = fakeHttp(() => ({ transactions: [] }))
    await new ShopifyAdapter(CFG).listTransactions(CREDS, { order_id: '7' } as never)
    expect(calls.map((c) => c.path)).toEqual(['orders/7/transactions.json'])
  })
})
