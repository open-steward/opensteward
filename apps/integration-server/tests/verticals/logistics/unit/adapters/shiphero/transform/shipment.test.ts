import { describe, it, expect, vi, beforeEach } from 'vitest'

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))

vi.mock('../../../../../../../src/verticals/logistics/adapters/shiphero/client', () => ({
  ShipheroClient: class {
    query = queryMock
  },
}))

import { ShipheroAdapter } from '../../../../../../../src/verticals/logistics/adapters/shiphero'
import {
  transformShipment,
  type ShipheroShipment,
} from '../../../../../../../src/verticals/logistics/adapters/shiphero/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'
import type { Credentials } from '../../../../../../../src/verticals/logistics/adapter/interface'

/**
 * `listShipments` is the second backlog cell for this adapter, same shape as
 * `listOrders` (see order.test.ts for why the pagination placement is the
 * thing pinned here): `shipments { data(first:, after:) { edges { node … } } }`,
 * with the root `shipments(…)` taking filters only.
 */

function makeShipment(overrides: Partial<ShipheroShipment> = {}): ShipheroShipment {
  return {
    id: 'sh-shp-1',
    tracking_number: 'SH-TRK',
    status: 'shipped',
    carrier: 'usps',
    shipping_method: 'PRIORITY',
    total_weight: 16,
    weight_unit: 'oz',
    shipping_address: { name: 'Bob', city: 'Austin', country: 'US' },
    warehouse_address: { name: 'WH', city: 'Dallas', country: 'US' },
    label_url: 'https://shiphero.com/l.pdf',
    reference: 'REF',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

/** The `shipments` query result: `data` is the connection, one edge per shipment. */
function page(nodes: ShipheroShipment[], endCursor: string | null = null) {
  return {
    shipments: {
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

describe('shiphero transformShipment', () => {
  it('produces output the canonical schema accepts', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeShipment()))).not.toThrow()
  })

  it('preserves the raw payload by reference', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('parses a sparse shipment too', () => {
    const sparse = { id: 'sh-shp-sparse' } as ShipheroShipment
    expect(ShipmentSchema.safeParse(transformShipment(sparse)).success).toBe(true)
  })
})

describe('ShipheroAdapter.listShipments', () => {
  beforeEach(() => {
    queryMock.mockReset()
  })

  it('unwraps shipments.data.edges[].node into canonical shipments', async () => {
    queryMock.mockResolvedValueOnce(
      page([makeShipment({ id: 'sh-shp-1' }), makeShipment({ id: 'sh-shp-2' })], 'cursor-2'),
    )

    const out = await adapter.listShipments(credentials, {})

    expect(out.map((s) => s.id)).toEqual(['sh-shp-1', 'sh-shp-2'])
    for (const s of out) expect(() => ShipmentSchema.parse(s)).not.toThrow()
  })

  it('puts first/after on the data connection, not the root field', async () => {
    queryMock.mockResolvedValueOnce(page([]))

    await adapter.listShipments(credentials, {})

    const [gql] = queryMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(gql).toMatch(
      /shipments \{ request_id data\(first: \$first, after: \$after\) \{ edges \{ node \{/,
    )
    expect(gql).not.toMatch(/shipments\(/)
    expect(gql).toContain('pageInfo { hasNextPage endCursor }')
  })

  it('maps params.limit to first and params.cursor to after', async () => {
    queryMock.mockResolvedValueOnce(page([]))

    await adapter.listShipments(credentials, { limit: 2, cursor: 'cursor-2' })

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), { first: 2, after: 'cursor-2' })
  })

  it('sends neither argument when the caller gives none', async () => {
    queryMock.mockResolvedValueOnce(page([]))

    await adapter.listShipments(credentials, {})

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), {
      first: undefined,
      after: undefined,
    })
  })

  it('returns [] for an empty page', async () => {
    queryMock.mockResolvedValueOnce(page([]))
    expect(await adapter.listShipments(credentials, {})).toEqual([])
  })
})
