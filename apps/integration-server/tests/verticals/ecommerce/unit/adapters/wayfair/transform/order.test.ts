import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawWayfairPurchaseOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/wayfair/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawWayfairPurchaseOrder> = {}): RawWayfairPurchaseOrder {
  return {
    poNumber: 'PO-20240501-001',
    poDate: '2024-05-01T10:00:00.000Z',
    customerName: 'Jane Smith',
    customerAddress1: '123 Main St',
    customerCity: 'Boston',
    customerState: 'MA',
    customerPostalCode: '02101',
    products: [{ partNumber: 'WF-CHAIR-001', quantity: 2, price: 249.99 }],
    ...overrides,
  }
}

describe('transformOrder (Wayfair)', () => {
  it('maps poNumber as id, orderNumber, and name', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('PO-20240501-001')
    expect(result.orderNumber).toBe('PO-20240501-001')
    expect(result.name).toBe('PO-20240501-001')
  })

  it('hardcodes currency to USD', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('USD')
  })

  it('computes totalPrice as sum of line item price * quantity in minor units', () => {
    // 249.99 * 100 = 24999 cents per unit; 24999 * 2 = 49998
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 49998, currency: 'USD' })
  })

  it('sets financialStatus to PENDING', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PENDING')
  })

  it('sets fulfillmentStatus to UNFULFILLED by default', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('sets fulfillmentStatus to FULFILLED when acknowledged is true', () => {
    const result = transformOrder(makeOrder({ acknowledged: true }))
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps line items with synthesised id, sku, title, quantity, and price', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('WF-CHAIR-001-0')
    expect(li.sku).toBe('WF-CHAIR-001')
    expect(li.title).toBe('WF-CHAIR-001')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 24999, currency: 'USD' })
  })

  it('indexes multiple line items with their position', () => {
    const result = transformOrder(
      makeOrder({
        products: [
          { partNumber: 'WF-CHAIR-001', quantity: 1, price: 100 },
          { partNumber: 'WF-TABLE-002', quantity: 3, price: 50 },
        ],
      }),
    )
    expect(result.lineItems![0]!.id).toBe('WF-CHAIR-001-0')
    expect(result.lineItems![1]!.id).toBe('WF-TABLE-002-1')
  })

  it('maps shippingAddress from customer fields with hardcoded country US', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toEqual({
      line1: '123 Main St',
      line2: undefined,
      city: 'Boston',
      region: 'MA',
      postalCode: '02101',
      country: 'US',
    })
  })

  it('omits shippingAddress when no customer address fields are present', () => {
    const result = transformOrder(
      makeOrder({
        customerAddress1: null,
        customerCity: null,
        customerPostalCode: null,
      }),
    )
    expect(result.shippingAddress).toBeUndefined()
  })

  it('maps note from packingSlipUrl', () => {
    const result = transformOrder(
      makeOrder({ packingSlipUrl: 'https://wayfair.com/packing/PO-20240501-001.pdf' }),
    )
    expect(result.note).toBe(
      'Packing slip: https://wayfair.com/packing/PO-20240501-001.pdf',
    )
  })

  it('leaves note undefined when packingSlipUrl is absent', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBeUndefined()
  })

  it('maps createdAt and processedAt from poDate', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-05-01T10:00:00.000Z')
    expect(result.processedAt).toBe('2024-05-01T10:00:00.000Z')
  })

  it('handles missing products gracefully with empty lineItems and zero totalPrice', () => {
    const result = transformOrder(makeOrder({ products: undefined }))
    expect(result.lineItems).toHaveLength(0)
    expect(result.totalPrice).toEqual({ amount: 0, currency: 'USD' })
  })

  it('stores raw input in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
