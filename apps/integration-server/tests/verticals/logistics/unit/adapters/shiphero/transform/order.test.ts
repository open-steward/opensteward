import { describe, it, expect, vi, beforeEach } from 'vitest'

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))

vi.mock('../../../../../../../src/verticals/logistics/adapters/shiphero/client', () => ({
  ShipheroClient: class {
    query = queryMock
  },
}))

import { ShipheroAdapter } from '../../../../../../../src/verticals/logistics/adapters/shiphero'
import {
  transformOrder,
  type ShipheroOrder,
} from '../../../../../../../src/verticals/logistics/adapters/shiphero/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'
import type { Credentials } from '../../../../../../../src/verticals/logistics/adapter/interface'

/**
 * `listOrders` was a backlog cell from the logistics audit: the adapter had
 * `getOrder` / `createOrder` and no list, so a sync reported
 * `orders: 0 (skipped)`. The part worth pinning is where ShipHero puts the
 * Relay pagination arguments — on the nested `data` connection, not the root
 * field:
 *
 *     orders { data(first: 10, after: "…") { edges { node { … } } pageInfo { … } } }
 *
 * The root `orders(…)` takes filters only, so `orders(first: 10)` is a schema
 * error on every call while typecheck stays green. Confirmed against
 * developer.shiphero.com/getting-started/#pagination and the `orders` query
 * argument list at developer.shiphero.com/schema/queries/orders.html.
 */

function makeOrder(overrides: Partial<ShipheroOrder> = {}): ShipheroOrder {
  return {
    id: 'sh-ord-1',
    order_number: 'SH-PO-1',
    fulfillment_status: 'pending',
    customer_id: 'cust-1',
    warehouse_id: 'wh-1',
    shipping_address: { name: 'Bob', city: 'Austin', country: 'US' },
    warehouse_address: { name: 'WH', city: 'Dallas', country: 'US' },
    line_items: [{ sku: 'X', quantity: 1, product_name: 'Thing', price: 19.99 }],
    shipment_ids: ['s1', 's2'],
    notes: 'Note',
    required_ship_method: 'PRIORITY',
    order_date: '2024-03-15T00:00:00Z',
    created_at: '2024-03-15T08:00:00Z',
    updated_at: '2024-03-15T09:00:00Z',
    ...overrides,
  }
}

/** The `orders` query result: `data` is the connection, one edge per order. */
function page(nodes: ShipheroOrder[], endCursor: string | null = null) {
  return {
    orders: {
      request_id: 'req-1',
      data: {
        edges: nodes.map((node) => ({ node })),
        pageInfo: { hasNextPage: endCursor !== null, endCursor },
      },
    },
  }
}

const credentials = { accessToken: 'TEST_token' } as Credentials
const adapter = new ShipheroAdapter()

describe('shiphero transformOrder', () => {
  it('produces output the canonical schema accepts', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })

  it('preserves the raw payload by reference', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('parses a sparse order too', () => {
    const sparse = { id: 'sh-ord-sparse' } as ShipheroOrder
    expect(OrderSchema.safeParse(transformOrder(sparse)).success).toBe(true)
  })

  it('converts the decimal line-item price to integer minor units', () => {
    // ShipHero reports `price` in major units; canonical `Amount` is an integer
    // in minor units. The schema round-trip above rejected the raw decimal with
    // `expected int` — the baselined flat test feeds the same 19.99 through and
    // never parses, so it had not noticed.
    const asString = transformOrder(
      makeOrder({ line_items: [{ sku: 'X', quantity: 1, price: '19.99' }] }),
    )
    const asNumber = transformOrder(
      makeOrder({ line_items: [{ sku: 'X', quantity: 1, price: 19.99 }] }),
    )
    expect(asString.lineItems?.[0].unitAmount).toBe(1999)
    expect(asNumber.lineItems?.[0].unitAmount).toBe(1999)
  })

  it('leaves unitAmount undefined when the price is not reported', () => {
    const order = transformOrder(
      makeOrder({ line_items: [{ sku: 'X', quantity: 1, price: null }] }),
    )
    expect(order.lineItems?.[0].unitAmount).toBeUndefined()
    expect(() => OrderSchema.parse(order)).not.toThrow()
  })
})

describe('ShipheroAdapter.listOrders', () => {
  beforeEach(() => {
    queryMock.mockReset()
  })

  it('unwraps orders.data.edges[].node into canonical orders', async () => {
    queryMock.mockResolvedValueOnce(
      page([makeOrder({ id: 'sh-ord-1' }), makeOrder({ id: 'sh-ord-2' })], 'cursor-2'),
    )

    const out = await adapter.listOrders(credentials, {})

    expect(out.map((o) => o.id)).toEqual(['sh-ord-1', 'sh-ord-2'])
    for (const o of out) expect(() => OrderSchema.parse(o)).not.toThrow()
  })

  it('puts first/after on the data connection, not the root field', async () => {
    queryMock.mockResolvedValueOnce(page([]))

    await adapter.listOrders(credentials, {})

    const [gql] = queryMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(gql).toMatch(
      /orders \{ request_id data\(first: \$first, after: \$after\) \{ edges \{ node \{/,
    )
    expect(gql).not.toMatch(/orders\(/)
    expect(gql).toContain('pageInfo { hasNextPage endCursor }')
  })

  it('maps params.limit to first and params.cursor to after', async () => {
    queryMock.mockResolvedValueOnce(page([]))

    await adapter.listOrders(credentials, { limit: 2, cursor: 'cursor-2' })

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), { first: 2, after: 'cursor-2' })
  })

  it('sends neither argument when the caller gives none', async () => {
    // Omitting `first` lets ShipHero apply its documented default of 100;
    // sending `null` for `after` would be a different request.
    queryMock.mockResolvedValueOnce(page([]))

    await adapter.listOrders(credentials, {})

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), {
      first: undefined,
      after: undefined,
    })
  })

  it('ignores a cursor that is not a string', async () => {
    // `cursor` rides the QueryParams index signature as `unknown`; a number
    // there is a caller bug, not an `after` value.
    queryMock.mockResolvedValueOnce(page([]))

    await adapter.listOrders(credentials, { cursor: 7 })

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), {
      first: undefined,
      after: undefined,
    })
  })

  it('returns [] for an empty page', async () => {
    queryMock.mockResolvedValueOnce(page([]))
    expect(await adapter.listOrders(credentials, {})).toEqual([])
  })
})
