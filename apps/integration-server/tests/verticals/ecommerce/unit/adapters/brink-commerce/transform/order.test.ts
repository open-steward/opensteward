/**
 * Fixtures follow the OrderManagement OpenAPI embedded in
 * https://docs.brinkcommerce.com/technical/api-references/order/orders.md:
 * `Order` (GET /orders/{orderId}) and `OrderSummary` (rows of
 * `orderSummaries` from GET /orders/email/{email}), with their documented
 * required fields; `OrderAddress` uses givenName / familyName /
 * stateOrProvince / telephoneNumber.
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  transformOrderSummary,
  type RawBrinkOrder,
  type RawBrinkOrderSummary,
} from '../../../../../../../src/verticals/ecommerce/adapters/brink-commerce/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

const summary: RawBrinkOrderSummary = {
  id: '2b7d1c52-5a8e-4a3f-9f55-0c1e6f3b2a10',
  date: '2024-03-01T10:15:00Z',
  isTaxIncludedInPrice: true,
  storeGroupId: 'se-b2c',
  countryCode: 'SE',
  currencyCode: 'SEK',
  reference: '100042',
  languageCode: 'sv',
  channelType: 'B2C',
  isTaxExemptionEligible: false,
  isTaxExempt: false,
  taxationCountry: 'SE',
  totals: {
    subTotal: 50000,
    shippingTotal: 4900,
    discountTotal: 5000,
    giftCardTotal: 0,
    bonusTotal: 0,
    taxTotal: 10980,
    grandTotal: 54900,
  },
  status: { orderStates: ['PLACED'], customStates: [] },
}

const order: RawBrinkOrder = {
  ...summary,
  orderLines: [
    {
      id: '6f1a8c3e-1d2b-4e5f-8a9b-0c1d2e3f4a5b',
      productVariantId: 'tee-blue-m',
      productParentId: 'tee',
      quantity: 2,
      displayName: 'T-shirt, blue M',
      name: 'Tee blue M',
      displayDescription: '',
      description: '',
      basePriceAmount: 25000,
      salePriceAmount: 22500,
      totalPriceAmount: 45000,
      discountAmount: 0,
      totalDiscountAmount: 5000,
      totalTaxAmount: 10000,
      taxPercentage: 2500,
      taxPercentageDecimals: 2,
      currencyCode: 'SEK',
      imageUrl: 'https://cdn.example.com/tee.jpg',
      taxGroupId: 'standard',
      priceUnitType: 'PIECE',
    },
  ],
  billingAddress: {
    givenName: 'Anna',
    familyName: 'Svensson',
    streetAddress: 'Storgatan 1',
    streetAddress2: '',
    city: 'Stockholm',
    postalCode: '11122',
    stateOrProvince: '',
    country: 'SE',
    telephoneNumber: '+46700000000',
    email: 'anna@example.com',
  },
  shippingAddress: {
    givenName: 'Anna',
    familyName: 'Svensson',
    streetAddress: 'Storgatan 1',
    streetAddress2: 'lgh 1101',
    city: 'Stockholm',
    postalCode: '11122',
    stateOrProvince: 'AB',
    country: 'SE',
    telephoneNumber: '+46700000000',
    email: 'anna.delivery@example.com',
  },
  discountCodeRules: [
    {
      id: 'rule-1',
      code: 'SPRING10',
      name: 'Spring 10%',
      freeShipping: false,
      discountAmount: 5000,
      currencyCode: 'SEK',
    },
  ],
}

describe('transformOrderSummary (brink-commerce)', () => {
  it('parses against OrderSchema and maps header and totals in minor units', () => {
    const out = OrderSchema.parse(transformOrderSummary(summary))
    expect(out.id).toBe(summary.id)
    expect(out.orderNumber).toBe('100042')
    expect(out.currency).toBe('SEK')
    expect(out.totalPrice).toEqual({ amount: 54900, currency: 'SEK' })
    expect(out.subtotalPrice).toEqual({ amount: 50000, currency: 'SEK' })
    expect(out.totalShipping).toEqual({ amount: 4900, currency: 'SEK' })
    expect(out.totalDiscounts).toEqual({ amount: 5000, currency: 'SEK' })
    expect(out.totalTax).toEqual({ amount: 10980, currency: 'SEK' })
    expect(out.createdAt).toBe('2024-03-01T10:15:00.000Z')
    expect(out.lineItems).toBeUndefined()
  })

  it('maps PLACED to AUTHORIZED / UNFULFILLED', () => {
    const out = transformOrderSummary(summary)
    expect(out.financialStatus).toBe('AUTHORIZED')
    expect(out.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps delivered, refunded and cancelled states', () => {
    const at = (orderStates: string[]) =>
      transformOrderSummary({ ...summary, status: { orderStates, customStates: [] } })
    expect(at(['FULLY_DELIVERED'])).toMatchObject({
      financialStatus: 'PAID',
      fulfillmentStatus: 'FULFILLED',
    })
    expect(at(['PARTIALLY_DELIVERED', 'RELEASED'])).toMatchObject({
      financialStatus: 'PARTIALLY_PAID',
      fulfillmentStatus: 'PARTIAL',
    })
    expect(at(['FULLY_DELIVERED', 'PARTIALLY_REFUNDED']).financialStatus).toBe('PARTIALLY_REFUNDED')
    expect(at(['FULLY_DELIVERED', 'FULLY_REFUNDED']).financialStatus).toBe('REFUNDED')
    expect(at(['CANCELLED']).financialStatus).toBe('VOIDED')
  })

  it('throws rather than inventing a currency when currencyCode is missing', () => {
    expect(() =>
      transformOrderSummary({ ...summary, currencyCode: undefined as unknown as string }),
    ).toThrow(/currencyCode/)
  })
})

describe('transformOrder (brink-commerce)', () => {
  it('parses against OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(order))).not.toThrow()
  })

  it('maps order lines from the documented OrderLine fields', () => {
    const [li] = transformOrder(order).lineItems!
    expect(li).toMatchObject({
      id: order.orderLines[0]!.id,
      productId: 'tee',
      variantId: 'tee-blue-m',
      title: 'T-shirt, blue M',
      quantity: 2,
      price: { amount: 22500, currency: 'SEK' },
      totalDiscount: { amount: 5000, currency: 'SEK' },
    })
  })

  it('maps OrderAddress fields', () => {
    const out = transformOrder(order)
    expect(out.shippingAddress).toEqual({
      line1: 'Storgatan 1',
      line2: 'lgh 1101',
      city: 'Stockholm',
      region: 'AB',
      postalCode: '11122',
      country: 'SE',
    })
    expect(out.billingAddress?.line2).toBeUndefined()
    expect(out.billingAddress?.region).toBeUndefined()
  })

  it('maps the billing email and discount codes', () => {
    const out = transformOrder(order)
    expect(out.email).toBe('anna@example.com')
    expect(out.discountCodes).toEqual(['SPRING10'])
  })
})
