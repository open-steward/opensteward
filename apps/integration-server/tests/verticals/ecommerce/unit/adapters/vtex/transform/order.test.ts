import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  transformOrderSummary,
  untransformOrder,
  type RawVtexOrder,
  type RawVtexOrderSummary,
} from '../../../../../../../src/verticals/ecommerce/adapters/vtex/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawVtexOrder> = {}): RawVtexOrder {
  return {
    orderId: 'ORD-1001-01',
    sequence: '501',
    status: 'invoiced',
    value: 10990,
    creationDate: '2024-05-01T10:00:00.000Z',
    lastChange: '2024-05-02T12:00:00.000Z',
    currencyCode: 'BRL',
    clientProfileData: {
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '+5511999990000',
    },
    shippingData: {
      address: {
        street: 'Rua das Flores',
        number: '42',
        city: 'São Paulo',
        state: 'SP',
        postalCode: '01310-100',
        country: 'BR',
      },
    },
    totals: [
      { id: 'Items', name: 'Items Total', value: 9990 },
      { id: 'Shipping', name: 'Shipping', value: 1000 },
      { id: 'Tax', name: 'Tax', value: 500 },
      { id: 'Discounts', name: 'Discounts', value: -500 },
    ],
    items: [
      {
        id: 'SKU-001',
        productId: 'PROD-001',
        refId: 'REF-001',
        name: 'Widget',
        skuName: 'Widget Blue',
        price: 9990,
        sellingPrice: 9990,
        quantity: 1,
      },
    ],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields and stringifies orderId', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('ORD-1001-01')
    expect(result.orderNumber).toBe('501')
    expect(result.name).toBe('#501')
    expect(result.email).toBe('ada@example.com')
    expect(result.phone).toBe('+5511999990000')
    expect(result.currency).toBe('BRL')
  })

  it('maps invoiced status to PAID / FULFILLED', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps payment-pending to PENDING / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'payment-pending' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps handling to PAID / PARTIAL', () => {
    const result = transformOrder(makeOrder({ status: 'handling' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps canceled to VOIDED / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'canceled' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('passes money values through as integer minor units (centavos)', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 10990, currency: 'BRL' })
    expect(result.subtotalPrice).toEqual({ amount: 9990, currency: 'BRL' })
    expect(result.totalShipping).toEqual({ amount: 1000, currency: 'BRL' })
    expect(result.totalTax).toEqual({ amount: 500, currency: 'BRL' })
    // Discounts value is negative on VTEX; transform uses Math.abs
    expect(result.totalDiscounts).toEqual({ amount: 500, currency: 'BRL' })
  })

  it('defaults currency to BRL when not provided', () => {
    const result = transformOrder(makeOrder({ currencyCode: undefined }))
    expect(result.currency).toBe('BRL')
    expect(result.totalPrice?.currency).toBe('BRL')
  })

  it('maps shipping address with street + number joined by comma', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress?.line1).toBe('Rua das Flores, 42')
    expect(result.shippingAddress?.city).toBe('São Paulo')
    expect(result.shippingAddress?.postalCode).toBe('01310-100')
    expect(result.shippingAddress?.country).toBe('BR')
  })

  it('falls back billing address to shipping when invoiceData absent', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toEqual(result.shippingAddress)
  })

  it('maps line items with VTEX integer minor unit prices', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('SKU-001')
    expect(li.productId).toBe('PROD-001')
    expect(li.title).toBe('Widget Blue')
    expect(li.quantity).toBe(1)
    expect(li.price).toEqual({ amount: 9990, currency: 'BRL' })
    expect(li.sku).toBe('REF-001')
  })

  it('sets cancelledAt and cancelReason when order is canceled', () => {
    const result = transformOrder(
      makeOrder({
        status: 'canceled',
        lastChange: '2024-06-01T08:00:00.000Z',
        cancelledData: { reason: 'Customer request' },
      }),
    )
    expect(result.cancelledAt).toBe('2024-06-01T08:00:00.000Z')
    expect(result.cancelReason).toBe('Customer request')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('transformOrderSummary', () => {
  function makeSummary(overrides: Partial<RawVtexOrderSummary> = {}): RawVtexOrderSummary {
    return {
      orderId: 'ORD-1001-01',
      sequence: '501',
      status: 'payment-approved',
      value: 10990,
      creationDate: '2024-05-01T10:00:00.000Z',
      currencyCode: 'BRL',
      ...overrides,
    }
  }

  it('maps minimal summary fields', () => {
    const result = transformOrderSummary(makeSummary())
    expect(result.id).toBe('ORD-1001-01')
    expect(result.orderNumber).toBe('501')
    expect(result.name).toBe('#501')
    expect(result.currency).toBe('BRL')
    expect(result.totalPrice).toEqual({ amount: 10990, currency: 'BRL' })
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrderSummary(makeSummary())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOrder', () => {
  it('returns orderId and clientProfileData email', () => {
    const raw = untransformOrder({
      id: 'ORD-1001-01',
      email: 'ada@example.com',
      phone: '+5511999990000',
    })
    expect(raw['orderId']).toBe('ORD-1001-01')
    expect((raw['clientProfileData'] as Record<string, unknown>)['email']).toBe('ada@example.com')
    expect((raw['clientProfileData'] as Record<string, unknown>)['phone']).toBe('+5511999990000')
  })

  it('omits clientProfileData when email is absent', () => {
    const raw = untransformOrder({ id: 'ORD-1001-01' })
    expect(raw['clientProfileData']).toBeUndefined()
  })

  it('round-trips id and email from a transformed order', () => {
    const canonical = transformOrder(makeOrder())
    const raw = untransformOrder(canonical)
    expect(raw['orderId']).toBe('ORD-1001-01')
    expect((raw['clientProfileData'] as Record<string, unknown>)['email']).toBe('ada@example.com')
  })
})
