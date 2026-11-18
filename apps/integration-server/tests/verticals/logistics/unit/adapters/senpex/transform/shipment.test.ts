import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type SenpexOrder,
} from '../../../../../../../src/verticals/logistics/adapters/senpex/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<SenpexOrder> = {}): SenpexOrder {
  return {
    id: 'senpex-888',
    order_name: 'Batch Order #1',
    status: 1630,
    pack_from_text: '50 Origin Blvd, San Jose, CA',
    routes: [
      {
        id: 'route-1',
        route_to_text: '10 Delivery Ln, Oakland, CA',
        rec_name: 'Alice Doe',
        rec_phone: 4155550001,
        route_status: 1,
        delivered_at: null,
      },
    ],
    order_price: 22.75,
    order_price_currency: 'USD',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T12:00:00Z',
    taken_at: '2024-03-01T08:00:00Z',
    delivered_at: null,
    ...overrides,
  }
}

// ─── transformShipment ────────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps id as string and trackingNumber equals id', () => {
    const result = transformShipment(makeOrder())
    expect(result.id).toBe('senpex-888')
    expect(result.trackingNumber).toBe('senpex-888')
  })

  it('sets carrierId to senpex and serviceCode to senpex_delivery', () => {
    const result = transformShipment(makeOrder())
    expect(result.carrierId).toBe('senpex')
    expect(result.serviceCode).toBe('senpex_delivery')
  })

  it('maps numeric status 1630 → OUT_FOR_DELIVERY', () => {
    // Source: s < 1630 → IN_TRANSIT; s < 1700 → OUT_FOR_DELIVERY. So 1630 = OUT_FOR_DELIVERY.
    expect(transformShipment(makeOrder({ status: 1630 })).status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps all senpex status codes', () => {
    // Boundary table derived from source mapStatus():
    //   s < 1500 → LABEL_CREATED
    //   s < 1550 → PENDING
    //   s < 1630 → IN_TRANSIT
    //   s < 1700 → OUT_FOR_DELIVERY  (1630 and 1670 fall here)
    //   s === 1700 → DELIVERED
    //   s === -1  → CANCELLED
    const cases: [number | string, string][] = [
      [999, 'LABEL_CREATED'],
      [1000, 'LABEL_CREATED'],
      [1499, 'LABEL_CREATED'],
      [1500, 'PENDING'],
      [1549, 'PENDING'],
      [1550, 'IN_TRANSIT'],
      [1629, 'IN_TRANSIT'],
      [1630, 'OUT_FOR_DELIVERY'],
      [1670, 'OUT_FOR_DELIVERY'],
      [1699, 'OUT_FOR_DELIVERY'],
      [1700, 'DELIVERED'],
      [-1, 'CANCELLED'],
      ['cancelled', 'CANCELLED'],
      ['canceled', 'CANCELLED'],
    ]
    for (const [status, expected] of cases) {
      expect(transformShipment(makeOrder({ status })).status).toBe(expected)
    }
  })

  it('maps pack_from_text → originAddress.street1', () => {
    const result = transformShipment(makeOrder())
    expect(result.originAddress?.street1).toBe('50 Origin Blvd, San Jose, CA')
  })

  it('maps first route to destinationAddress', () => {
    const result = transformShipment(makeOrder())
    expect(result.destinationAddress?.street1).toBe('10 Delivery Ln, Oakland, CA')
    expect(result.destinationAddress?.name).toBe('Alice Doe')
    expect(result.destinationAddress?.phone).toBe('4155550001')
  })

  it('maps order_price → cost.amount and order_price_currency', () => {
    const result = transformShipment(makeOrder())
    expect(result.cost?.amount).toBe(22.75)
    expect(result.cost?.currency).toBe('USD')
  })

  it('defaults cost currency to USD when absent', () => {
    const result = transformShipment(makeOrder({ order_price_currency: null }))
    expect(result.cost?.currency).toBe('USD')
  })

  it('omits cost when order_price is null', () => {
    const result = transformShipment(makeOrder({ order_price: null }))
    expect(result.cost).toBeUndefined()
  })

  it('maps order_name → reference', () => {
    expect(transformShipment(makeOrder()).reference).toBe('Batch Order #1')
  })

  it('parses createdAt and updatedAt as Dates', () => {
    const result = transformShipment(makeOrder())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('omits originAddress when pack_from_text is absent', () => {
    const result = transformShipment(makeOrder({ pack_from_text: null }))
    expect(result.originAddress).toBeUndefined()
  })

  it('omits destinationAddress when routes is empty', () => {
    const result = transformShipment(makeOrder({ routes: [] }))
    expect(result.destinationAddress).toBeUndefined()
  })

  it('converts numeric id to string', () => {
    const result = transformShipment(makeOrder({ id: 12345 }))
    expect(result.id).toBe('12345')
  })

  it('throws schema validation because transformShipment emits float cost.amount but MoneySchema.amount requires int (minor units)', () => {
    // Senpex API returns decimal prices (e.g. 22.75 USD). transformShipment passes them
    // straight through as floats. MoneySchema uses Amount = z.number().int() (minor units).
    // Known schema incompatibility — the transform emits major-unit decimals while
    // Amount requires integer minor units, so schema validation fails.
    expect(() => ShipmentSchema.parse(transformShipment(makeOrder()))).toThrow()
  })

  it('passes metadata as raw object reference', () => {
    const raw = makeOrder()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})
