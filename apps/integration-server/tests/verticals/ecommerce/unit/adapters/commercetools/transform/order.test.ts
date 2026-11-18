import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  buildActionsForOrder,
  type RawCtOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/commercetools/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawCtOrder> = {}): RawCtOrder {
  return {
    id: 'order-1',
    version: 2,
    orderNumber: '1001',
    customerId: 'cust-1',
    customerEmail: 'ada@example.com',
    orderState: 'Confirmed',
    paymentState: 'Paid',
    shipmentState: 'Shipped',
    totalPrice: { type: 'centPrecision', centAmount: 10824, currencyCode: 'USD', fractionDigits: 2 },
    taxedPrice: {
      totalNet: { type: 'centPrecision', centAmount: 10000, currencyCode: 'USD', fractionDigits: 2 },
      totalGross: { type: 'centPrecision', centAmount: 10824, currencyCode: 'USD', fractionDigits: 2 },
      totalTax: { type: 'centPrecision', centAmount: 824, currencyCode: 'USD', fractionDigits: 2 },
    },
    lineItems: [
      {
        id: 'li-1',
        productId: 'prod-abc',
        variant: { id: 1, sku: 'CB-250' },
        name: { 'en-US': 'Cold Brew Coffee' },
        quantity: 2,
        price: {
          value: { type: 'centPrecision', centAmount: 1999, currencyCode: 'USD', fractionDigits: 2 },
        },
      },
    ],
    customLineItems: [
      {
        id: 'cli-1',
        name: { 'en-US': 'Gift wrap' },
        money: { type: 'centPrecision', centAmount: 500, currencyCode: 'USD', fractionDigits: 2 },
        quantity: 1,
      },
    ],
    shippingAddress: {
      streetName: 'Programmer Way',
      streetNumber: '1',
      city: 'London',
      postalCode: 'NW1 2AB',
      country: 'GB',
    },
    paymentInfo: { payments: [{ id: 'pay-1', typeId: 'payment' }] },
    createdAt: '2024-05-01T10:00:00Z',
    lastModifiedAt: '2024-05-01T12:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (commercetools)', () => {
  it('maps orderState + paymentState + shipmentState to canonical enums', () => {
    const r = transformOrder(makeOrder())
    expect(r.financialStatus).toBe('PAID')
    expect(r.fulfillmentStatus).toBe('FULFILLED')
  })

  it('forces financial status to VOIDED when orderState is Cancelled', () => {
    const r = transformOrder(makeOrder({ orderState: 'Cancelled' }))
    expect(r.financialStatus).toBe('VOIDED')
  })

  it('flattens line items and custom line items into one array', () => {
    const r = transformOrder(makeOrder())
    expect(r.lineItems).toHaveLength(2)
    expect(r.lineItems![0]!.productId).toBe('prod-abc')
    expect(r.lineItems![0]!.variantId).toBe('prod-abc:1')
    expect(r.lineItems![1]!.title).toBe('Gift wrap')
    expect(r.lineItems![1]!.metadata['custom']).toBe(true)
  })

  it('maps total price + taxed price fields', () => {
    const r = transformOrder(makeOrder())
    expect(r.totalPrice).toEqual({ amount: 10824, currency: 'USD' })
    expect(r.totalTax).toEqual({ amount: 824, currency: 'USD' })
    expect(r.subtotalPrice).toEqual({ amount: 10000, currency: 'USD' })
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const r = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(r)).not.toThrow()
  })

  it('untransformOrder produces a cart draft with lineItems referencing variants', () => {
    const canonical = transformOrder(makeOrder())
    const cartDraft = untransformOrder(canonical) as Record<string, unknown>
    const items = cartDraft['lineItems'] as Array<{ productId: string; variantId: number; quantity: number }>
    expect(items[0]!.productId).toBe('prod-abc')
    expect(items[0]!.variantId).toBe(1)
    expect(cartDraft['currency']).toBe('USD')
  })

  it('builds setCustomerEmail action from a partial patch', () => {
    const actions = buildActionsForOrder(makeOrder(), { email: 'new@example.com' })
    expect(actions[0]).toEqual({ action: 'setCustomerEmail', email: 'new@example.com' })
  })
})
