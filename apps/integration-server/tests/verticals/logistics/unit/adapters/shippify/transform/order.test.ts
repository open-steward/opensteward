import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type ShippifyOrder,
} from '../../../../../../../src/verticals/logistics/adapters/shippify/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(overrides: Partial<ShippifyOrder> = {}): ShippifyOrder {
  return {
    id: 'ord-001',
    status: 'shipped',
    ref_id: 'REF-2024-001',
    customer_id: 'cust-99',
    warehouse_id: 'wh-01',
    task_ids: ['task-1', 'task-2'],
    pickup: { street1: '123 Main St', city: 'Miami', state: 'FL', country: 'US' },
    deliver: { street1: '456 Oak Ave', city: 'Atlanta', state: 'GA', country: 'US' },
    currency: 'USD',
    subtotal: 50.0,
    tax: 5.0,
    shipping: 10.0,
    discount: 2.0,
    total: 63.0,
    notes: 'Handle with care',
    items: [
      {
        id: 'item-1',
        sku: 'SKU-A',
        name: 'Widget',
        qty: 2,
        unit_price: 25.0,
        total_price: 50.0,
      },
    ],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (shippify)', () => {
  it('maps id, status and orderNumber (ref_id)', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('ord-001')
    expect(result.status).toBe('SHIPPED')
    expect(result.orderNumber).toBe('REF-2024-001')
  })

  it('maps customerId and warehouseId', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('cust-99')
    expect(result.warehouseId).toBe('wh-01')
  })

  it('includes shipmentIds from task_ids', () => {
    const result = transformOrder(makeOrder())
    expect(result.shipmentIds).toEqual(['task-1', 'task-2'])
  })

  it('maps origin and destination addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.originAddress?.city).toBe('Miami')
    expect(result.destinationAddress?.city).toBe('Atlanta')
  })

  it('maps monetary amounts', () => {
    const result = transformOrder(makeOrder())
    expect(result.subtotalAmount).toBe(50.0)
    expect(result.taxAmount).toBe(5.0)
    expect(result.shippingAmount).toBe(10.0)
    expect(result.discountAmount).toBe(2.0)
    expect(result.totalAmount).toBe(63.0)
  })

  it('maps lineItems from items array', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].sku).toBe('SKU-A')
    expect(result.lineItems![0].quantity).toBe(2)
  })

  it('maps all order statuses correctly', () => {
    const cases: [string | null | undefined, string][] = [
      ['pending', 'PENDING'],
      ['processing', 'PROCESSING'],
      ['on_hold', 'ON_HOLD'],
      ['awaiting', 'AWAITING_SHIPMENT'],
      ['shipped', 'SHIPPED'],
      ['delivered', 'DELIVERED'],
      ['cancelled', 'CANCELLED'],
      ['canceled', 'CANCELLED'],
      ['returned', 'RETURNED'],
      ['unknown_value', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformOrder(makeOrder({ status: status ?? undefined })).status).toBe(expected)
    }
  })

  it('passes OrderSchema.parse without throwing', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })

  it('handles empty task_ids as undefined shipmentIds', () => {
    const result = transformOrder(makeOrder({ task_ids: [] }))
    expect(result.shipmentIds).toBeUndefined()
  })

  it('maps createdAt and notes', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.notes).toBe('Handle with care')
  })
})
