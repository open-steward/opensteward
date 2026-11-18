import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawSprykerOrder,
  type RawSprykerOrderAttributes,
} from '../../../../../../../src/verticals/ecommerce/adapters/spryker/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrderAttrs(
  overrides: Partial<RawSprykerOrderAttributes> = {},
): RawSprykerOrderAttributes {
  return {
    orderReference: 'DE--42',
    createdAt: '2024-02-10T09:00:00.000Z',
    updatedAt: '2024-02-11T10:00:00.000Z',
    currencyIsoCode: 'EUR',
    priceMode: 'GROSS_MODE',
    totals: {
      expenseTotal: 799,
      discountTotal: 500,
      taxTotal: 1200,
      subtotal: 7999,
      grandTotal: 9498,
    },
    billingAddress: {
      firstName: 'Hans',
      lastName: 'Schmidt',
      address1: 'Alexanderplatz 1',
      city: 'Berlin',
      zipCode: '10178',
      iso2Code: 'DE',
    },
    shippingAddress: {
      firstName: 'Hans',
      lastName: 'Schmidt',
      address1: 'Kurfürstendamm 10',
      city: 'Berlin',
      zipCode: '10709',
      iso2Code: 'DE',
    },
    items: [
      {
        id: 101,
        sku: 'KEYBOARD-001',
        name: 'Mechanical Keyboard',
        unitPrice: 7999,
        sumPrice: 7999,
        quantity: 1,
        taxRate: 19,
        unitTaxAmountFullAggregation: 1277,
        sumTaxAmountFullAggregation: 1277,
        state: 'confirmed',
      },
    ],
    payments: [{ amount: 9498, paymentProviderName: 'DummyPayment', paymentMethodName: 'Invoice' }],
    calculatedDiscounts: {
      SAVE5: { unitAmount: 500, sumAmount: 500, displayName: '5€ Off', code: 'SAVE5' },
    },
    ...overrides,
  }
}

function makeOrder(overrides: Partial<RawSprykerOrderAttributes> = {}): RawSprykerOrder {
  return {
    type: 'orders',
    id: 'DE--42',
    attributes: makeOrderAttrs(overrides),
  }
}

describe('transformOrder (Spryker)', () => {
  it('maps JSON:API id and orderReference', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('DE--42')
    expect(result.orderNumber).toBe('DE--42')
    expect(result.name).toBe('DE--42')
  })

  it('passes Spryker minor-unit totals through directly', () => {
    const result = transformOrder(makeOrder())
    // Spryker prices are already integer minor-unit amounts
    expect(result.subtotalPrice).toEqual({ amount: 7999, currency: 'EUR' })
    expect(result.totalTax).toEqual({ amount: 1200, currency: 'EUR' })
    expect(result.totalShipping).toEqual({ amount: 799, currency: 'EUR' })
    expect(result.totalPrice).toEqual({ amount: 9498, currency: 'EUR' })
    expect(result.totalDiscounts).toEqual({ amount: 500, currency: 'EUR' })
  })

  it('infers PAID financial status from payment covering grand total', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
  })

  it('infers PENDING when no payments', () => {
    const result = transformOrder(makeOrder({ payments: [] }))
    expect(result.financialStatus).toBe('PENDING')
  })

  it('infers UNFULFILLED fulfillment status when items are confirmed', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('infers FULFILLED when all items are shipped', () => {
    const result = transformOrder(
      makeOrder({
        items: [{ id: 1, sku: 'A', name: 'A', quantity: 1, unitPrice: 100, state: 'shipped' }],
      }),
    )
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps billing and shipping addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.line1).toBe('Alexanderplatz 1')
    expect(result.billingAddress?.country).toBe('DE')
    expect(result.shippingAddress?.line1).toBe('Kurfürstendamm 10')
    expect(result.shippingAddress?.postalCode).toBe('10709')
  })

  it('maps line items with minor-unit prices and tax lines', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('101')
    expect(li.sku).toBe('KEYBOARD-001')
    expect(li.title).toBe('Mechanical Keyboard')
    expect(li.quantity).toBe(1)
    // unitPrice is already in minor units
    expect(li.price).toEqual({ amount: 7999, currency: 'EUR' })
    expect(li.taxLines).toHaveLength(1)
    expect(li.taxLines![0]!.rate).toBe(19 / 100)
  })

  it('extracts discount codes from calculatedDiscounts', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toContain('SAVE5')
  })

  it('maps timestamps from ISO strings', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-02-10T09:00:00.000Z')
    expect(result.updatedAt).toBe('2024-02-11T10:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })
})
