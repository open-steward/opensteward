import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type ClickPostOrderDetail,
} from '../../../../../../../src/verticals/logistics/adapters/clickpost/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(overrides: Partial<ClickPostOrderDetail> = {}): ClickPostOrderDetail {
  return {
    reference_number: 'REF-001',
    waybill: 'AWB-001',
    status: 'In Transit',
    clickpost_status_code: 15,
    order_type: 'prepaid',
    invoice_value: 1500,
    invoice_number: 'INV-001',
    pickup_name: 'Sender Corp',
    pickup_address: '1 Industrial Ave',
    pickup_city: 'Mumbai',
    pickup_state: 'MH',
    pickup_pincode: '400001',
    pickup_country: 'IN',
    drop_name: 'John Doe',
    drop_phone: '+919876543210',
    drop_email: 'john@example.com',
    drop_address: '456 Oak St',
    drop_city: 'Bangalore',
    drop_state: 'KA',
    drop_pincode: '560001',
    drop_country: 'IN',
    items: [{ sku: 'SKU-1', description: 'Widget', price: 750, quantity: 2 }],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T12:00:00Z',
    ...overrides,
  }
}

describe('clickpost transformOrder', () => {
  it('maps id, orderNumber, status', () => {
    const r = transformOrder(makeOrder())
    expect(r.id).toBe('REF-001')
    expect(r.orderNumber).toBe('INV-001')
    expect(r.status).toBe('SHIPPED')
  })

  it('falls back to reference_number for orderNumber when invoice_number is null', () => {
    const r = transformOrder(makeOrder({ invoice_number: null }))
    expect(r.orderNumber).toBe('REF-001')
  })

  it('maps originAddress and destinationAddress', () => {
    const r = transformOrder(makeOrder())
    expect(r.originAddress?.name).toBe('Sender Corp')
    expect(r.originAddress?.city).toBe('Mumbai')
    expect(r.destinationAddress?.name).toBe('John Doe')
    expect(r.destinationAddress?.city).toBe('Bangalore')
    expect(r.destinationAddress?.phone).toBe('+919876543210')
    expect(r.destinationAddress?.email).toBe('john@example.com')
  })

  it('maps lineItems', () => {
    const r = transformOrder(makeOrder())
    expect(r.lineItems).toHaveLength(1)
    expect(r.lineItems![0].sku).toBe('SKU-1')
    expect(r.lineItems![0].quantity).toBe(2)
    expect(r.lineItems![0].unitAmount).toBe(750)
    expect(r.lineItems![0].totalAmount).toBe(1500)
  })

  it('maps name and description from item.description', () => {
    const r = transformOrder(makeOrder())
    expect(r.lineItems![0].name).toBe('Widget')
    expect(r.lineItems![0].description).toBe('Widget')
  })

  it('maps shipmentIds from waybill', () => {
    const r = transformOrder(makeOrder())
    expect(r.shipmentIds).toEqual(['AWB-001'])
  })

  it('maps totalAmount and dates', () => {
    const r = transformOrder(makeOrder())
    expect(r.totalAmount).toBe(1500)
    expect(r.createdAt).toBeInstanceOf(Date)
    expect(r.updatedAt).toBeInstanceOf(Date)
  })

  it('passes OrderSchema.parse without throwing', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })

  it('maps order status codes correctly', () => {
    const cases: Array<[number | null, string]> = [
      [0, 'PENDING'],
      [5, 'AWAITING_SHIPMENT'],
      [30, 'SHIPPED'],
      [60, 'DELIVERED'],
      [75, 'PROCESSING'],
      [85, 'RETURNED'],
    ]
    for (const [code, expected] of cases) {
      expect(transformOrder(makeOrder({ clickpost_status_code: code })).status).toBe(expected)
    }
  })

  it('maps null status code with string fallback', () => {
    expect(
      transformOrder(makeOrder({ clickpost_status_code: null, status: 'cancelled' })).status,
    ).toBe('CANCELLED')
    expect(
      transformOrder(makeOrder({ clickpost_status_code: null, status: 'delivered' })).status,
    ).toBe('DELIVERED')
    expect(
      transformOrder(makeOrder({ clickpost_status_code: null, status: 'in transit' })).status,
    ).toBe('SHIPPED')
    expect(transformOrder(makeOrder({ clickpost_status_code: null, status: 'other' })).status).toBe(
      'PENDING',
    )
  })

  it('omits lineItems when items is null', () => {
    const r = transformOrder(makeOrder({ items: null }))
    expect(r.lineItems).toBeUndefined()
  })

  it('omits shipmentIds when waybill is null', () => {
    const r = transformOrder(makeOrder({ waybill: null }))
    expect(r.shipmentIds).toBeUndefined()
  })

  it('omits addresses when all address fields are null', () => {
    const r = transformOrder(
      makeOrder({
        pickup_name: null,
        pickup_address: null,
        pickup_city: null,
        drop_name: null,
        drop_address: null,
        drop_city: null,
      }),
    )
    expect(r.originAddress).toBeUndefined()
    expect(r.destinationAddress).toBeUndefined()
  })
})
