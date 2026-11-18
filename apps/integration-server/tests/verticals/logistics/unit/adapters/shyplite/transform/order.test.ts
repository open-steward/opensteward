import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type ShypliteOrder,
  type ShypliteOrderAddress,
  type ShypliteOrderItem,
} from '../../../../../../../src/verticals/logistics/adapters/shyplite/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeAddress(overrides: Partial<ShypliteOrderAddress> = {}): ShypliteOrderAddress {
  return {
    name: 'Jane Doe',
    address: '10 Baker St',
    city: 'Mumbai',
    state: 'MH',
    pincode: '400001',
    country: 'IN',
    phone: '+912212345678',
    email: 'jane@example.com',
    ...overrides,
  }
}

function makeItem(overrides: Partial<ShypliteOrderItem> = {}): ShypliteOrderItem {
  return {
    name: 'Widget',
    sku: 'WGT-01',
    quantity: 2,
    price: 999,
    ...overrides,
  }
}

function makeOrder(overrides: Partial<ShypliteOrder> = {}): ShypliteOrder {
  return {
    id: 'SHL-001',
    order_id: 'ORD-001',
    awb: 'AWB123456',
    status: 'shipped',
    carrier: 'delhivery',
    consignee: makeAddress(),
    pickup_address: makeAddress({ name: 'Warehouse', city: 'Delhi', state: 'DL' }),
    items: [makeItem()],
    weight: 0.5,
    cod: false,
    notes: 'Handle with care',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T08:00:00Z',
    ...overrides,
  }
}

describe('Shyplite transformOrder', () => {
  it('uses id field (coerced to string) as canonical id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('SHL-001')
  })

  it('falls back to order_id when id is null', () => {
    const result = transformOrder(makeOrder({ id: null }))
    expect(result.id).toBe('ORD-001')
  })

  it('maps "shipped" status to SHIPPED', () => {
    const result = transformOrder(makeOrder())
    expect(result.status).toBe('SHIPPED')
  })

  it('maps consignee to destinationAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.destinationAddress?.city).toBe('Mumbai')
    expect(result.destinationAddress?.state).toBe('MH')
    expect(result.destinationAddress?.postalCode).toBe('400001')
  })

  it('maps pickup_address to originAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.originAddress?.city).toBe('Delhi')
  })

  it('maps items to lineItems with sku, description, quantity, unitAmount', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].sku).toBe('WGT-01')
    expect(result.lineItems![0].description).toBe('Widget')
    expect(result.lineItems![0].quantity).toBe(2)
    expect(result.lineItems![0].unitAmount).toBe(999)
  })

  it('maps notes and createdAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.notes).toBe('Handle with care')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes OrderSchema validation', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('maps status variants correctly', () => {
    const cases: Array<[string | null | undefined, string]> = [
      ['delivered', 'DELIVERED'],
      ['in transit', 'SHIPPED'],
      ['in_transit', 'SHIPPED'],
      ['cancelled', 'CANCELLED'],
      ['lost', 'CANCELLED'],
      ['rto initiated', 'RETURNED'],
      ['return to origin', 'RETURNED'],
      ['booked', 'PENDING'],
      ['manifested', 'PENDING'],
      ['created', 'PENDING'],
      [null, 'PENDING'],
      [undefined, 'PENDING'],
    ]
    for (const [status, expected] of cases) {
      expect(transformOrder(makeOrder({ status: status ?? undefined })).status).toBe(expected)
    }
  })

  it('omits lineItems when items list is empty', () => {
    const result = transformOrder(makeOrder({ items: [] }))
    expect(result.lineItems).toBeUndefined()
  })

  it('omits destinationAddress when consignee has no meaningful fields', () => {
    const result = transformOrder(makeOrder({ consignee: {} }))
    expect(result.destinationAddress).toBeUndefined()
  })

  it('attaches raw as metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })
})
