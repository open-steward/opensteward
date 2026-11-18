import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawPlentyOneOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/plentyone/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

// ORDER_ITEM_TYPE_VARIATION = 1, ORDER_ITEM_TYPE_SHIPPING = 6
function makeOrder(overrides: Partial<RawPlentyOneOrder> = {}): RawPlentyOneOrder {
  return {
    id: 7001,
    statusId: 5, // paid
    createdAt: '2024-04-01T09:00:00.000Z',
    updatedAt: '2024-04-01T10:00:00.000Z',
    amounts: [
      {
        isSystemCurrency: true,
        currency: 'EUR',
        grossTotal: 119.99,
        netTotal: 100.83,
        vatTotal: 19.16,
        shippingCostsGross: 4.99,
      },
    ],
    orderItems: [
      {
        id: 9001,
        orderId: 7001,
        typeId: 1, // variation
        itemVariationId: 601,
        quantity: 2,
        orderItemName: 'Laptop Stand Pro',
        amounts: [{ priceGross: 57.50, currency: 'EUR' }],
      },
      {
        id: 9002,
        orderId: 7001,
        typeId: 6, // shipping
        orderItemName: 'Standard Shipping',
        amounts: [{ priceGross: 4.99, currency: 'EUR' }],
      },
    ],
    relations: [
      { referenceType: 'contact', referenceId: 5001 },
    ],
    billingAddress: {
      address1: 'Unter den Linden 1',
      postalCode: '10117',
      town: 'Berlin',
      countryIsoCode2: 'DE',
    },
    deliveryAddress: {
      address1: 'Kurfürstendamm 50',
      postalCode: '10707',
      town: 'Berlin',
      countryIsoCode2: 'DE',
    },
    ...overrides,
  }
}

describe('plentyone transformOrder', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('7001')
    expect(result.orderNumber).toBe('7001')
    expect(result.currency).toBe('EUR')
    expect(result.customerId).toBe('5001')
  })

  it('maps financialStatus from statusId', () => {
    // statusId 5 → PAID (5 <= 7)
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps PENDING for statusId <= 4', () => {
    const result = transformOrder(makeOrder({ statusId: 3 }))
    expect(result.financialStatus).toBe('PENDING')
  })

  it('maps VOIDED for statusId 8', () => {
    const result = transformOrder(makeOrder({ statusId: 8 }))
    expect(result.financialStatus).toBe('VOIDED')
  })

  it('converts EUR grossTotal to minor units', () => {
    const result = transformOrder(makeOrder())
    // 119.99 EUR = 11999 cents
    expect(result.totalPrice).toEqual({ amount: 11999, currency: 'EUR' })
    expect(result.totalTax).toEqual({ amount: 1916, currency: 'EUR' })
  })

  it('filters variation order items (typeId=1) for lineItems', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('9001')
    expect(li.variantId).toBe('601')
    expect(li.title).toBe('Laptop Stand Pro')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 5750, currency: 'EUR' })
  })

  it('maps shipping from shipping typeId order item', () => {
    const result = transformOrder(makeOrder())
    // shipping item priceGross 4.99 EUR = 499 cents
    expect(result.totalShipping).toEqual({ amount: 499, currency: 'EUR' })
  })

  it('maps billing and delivery addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.line1).toBe('Unter den Linden 1')
    expect(result.billingAddress?.country).toBe('DE')
    expect(result.shippingAddress?.postalCode).toBe('10707')
    expect(result.shippingAddress?.city).toBe('Berlin')
  })

  it('maps timestamps as ISO strings', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-04-01T09:00:00.000Z')
    expect(result.updatedAt).toBe('2024-04-01T10:00:00.000Z')
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

  it('round-trips writable fields via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const raw = untransformOrder(canonical)
    expect(raw.typeId).toBe(1)
    const orderItems = raw.orderItems as Array<{ typeId: number; orderItemName: string }>
    expect(orderItems[0]!.typeId).toBe(1)
    expect(orderItems[0]!.orderItemName).toBe('Laptop Stand Pro')
  })
})
