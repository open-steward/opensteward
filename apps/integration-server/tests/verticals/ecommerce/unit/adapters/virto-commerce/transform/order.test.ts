/**
 * Virto Commerce CustomerOrder → canonical Order.
 *
 * Field shapes verified against the live demo instance's
 * VirtoCommerce.Orders/swagger.json `components.schemas.CustomerOrder` /
 * `OrderAddress` / `OrderLineItem` / `PaymentIn` (fetched 2026-09-13):
 * `total`/`subTotal`/`taxTotal`/`discountTotal` are plain decimal numbers
 * with a separate `currency` field; `addresses[].addressType` is a real
 * enum (`Undefined|Billing|Shipping|BillingAndShipping|Pickup`);
 * `inPayments[].paymentStatus` is a real enum
 * (`New|Pending|Authorized|Paid|PartiallyRefunded|Refunded|Voided|Custom|
 * Cancelled|Declined|Error`) used to derive canonical `financialStatus`.
 * `status` (order) and `shipments[].status` are free-form, workflow-
 * configurable strings with no fixed vocabulary — `fulfillmentStatus` maps
 * to `'unknown'` rather than guessing at a store-specific status string.
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawVirtoCustomerOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/virto-commerce/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawVirtoCustomerOrder> = {}): RawVirtoCustomerOrder {
  return {
    id: 'order-1',
    number: 'ORD-0001',
    customerId: 'contact-1',
    currency: 'USD',
    status: 'New',
    total: 64.9,
    subTotal: 59.0,
    taxTotal: 5.9,
    discountTotal: 0,
    isCancelled: false,
    addresses: [
      { addressType: 'BillingAndShipping', line1: '1 Infinite Loop', city: 'Cupertino', countryCode: 'US' },
    ],
    items: [
      { id: 'li-1', productId: 'prod-1', name: 'Wireless Keyboard', quantity: 2, placedPrice: 29.5, sku: 'WK-2026' },
    ],
    inPayments: [{ id: 'pay-1', paymentStatus: 'Paid' }],
    shipments: [{ id: 'ship-1', status: 'New' }],
    createdDate: '2026-01-15T09:30:00Z',
    modifiedDate: '2026-02-01T14:20:00Z',
    ...overrides,
  }
}

describe('transformOrder (virto-commerce)', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('order-1')
    expect(result.orderNumber).toBe('ORD-0001')
    expect(result.customerId).toBe('contact-1')
    expect(result.currency).toBe('USD')
  })

  it('maps money totals to minor units under the order currency', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 6490, currency: 'USD' })
    expect(result.subtotalPrice).toEqual({ amount: 5900, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 590, currency: 'USD' })
  })

  it('derives financialStatus from the most recent inPayment status', () => {
    expect(transformOrder(makeOrder()).financialStatus).toBe('PAID')
    expect(
      transformOrder(makeOrder({ inPayments: [{ id: 'p', paymentStatus: 'Authorized' }] })).financialStatus,
    ).toBe('AUTHORIZED')
  })

  it('maps a cancelled order to VOIDED financial status regardless of payment status', () => {
    const result = transformOrder(makeOrder({ isCancelled: true, cancelledDate: '2026-02-02T00:00:00Z' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.cancelledAt).toBe('2026-02-02T00:00:00Z')
  })

  it('defaults financialStatus to PENDING with no payments yet', () => {
    expect(transformOrder(makeOrder({ inPayments: [] })).financialStatus).toBe('PENDING')
  })

  it('maps fulfillmentStatus to UNFULFILLED with no shipments, unknown otherwise', () => {
    expect(transformOrder(makeOrder({ shipments: [] })).fulfillmentStatus).toBe('UNFULFILLED')
    expect(transformOrder(makeOrder()).fulfillmentStatus).toBe('unknown')
  })

  it('splits a BillingAndShipping address onto both canonical fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.city).toBe('Cupertino')
    expect(result.shippingAddress?.city).toBe('Cupertino')
  })

  it('maps line items with quantity and unit price', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]).toMatchObject({ productId: 'prod-1', quantity: 2, sku: 'WK-2026' })
    expect(result.lineItems![0]!.price).toEqual({ amount: 2950, currency: 'USD' })
  })

  it('maps fulfillmentIds and transactionIds from shipments/inPayments', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentIds).toEqual(['ship-1'])
    expect(result.transactionIds).toEqual(['pay-1'])
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toEqual(raw)
  })

  it('satisfies OrderSchema, including a minimal order with no items/payments/shipments', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
    expect(() => OrderSchema.parse(transformOrder({ id: 'o2' }))).not.toThrow()
  })

  it('leaves every money field and currency unset when currency is not reported, rather than default it', () => {
    const result = transformOrder(makeOrder({ currency: undefined, items: undefined }))
    expect(result.currency).toBeUndefined()
    expect(result.totalPrice).toBeUndefined()
    expect(result.subtotalPrice).toBeUndefined()
    expect(result.totalTax).toBeUndefined()
    expect(result.totalDiscounts).toBeUndefined()
  })

  it('throws rather than price line items in a fabricated currency', () => {
    expect(() => transformOrder(makeOrder({ currency: undefined }))).toThrow(/currency/)
  })

  it('throws rather than fabricate a missing line item quantity or price', () => {
    expect(() =>
      transformOrder(makeOrder({ items: [{ id: 'li-1', quantity: undefined, placedPrice: 29.5 }] })),
    ).toThrow(/li-1/)
  })
})
