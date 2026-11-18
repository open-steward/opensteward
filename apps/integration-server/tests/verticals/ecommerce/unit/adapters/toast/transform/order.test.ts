/**
 * Toast Orders API Order → Order.
 *
 * The fixture is the first order of the documented example response of
 * GET /orders/v2/ordersBulk
 * (https://doc.toasttab.com/doc/devguide/apiOrdersGetDetailedInfoAboutMultipleOrders.html),
 * trimmed of fields the transform does not read. The currency is passed in,
 * as the adapter does from the Restaurants API `General.currencyCode`.
 */
import { describe, it, expect } from 'vitest'
import {
  restaurantCurrency,
  toastMoney,
  transformOrder,
  untransformOrder,
  type RawToastCheck,
  type RawToastOrder,
  type RawToastSelection,
} from '../../../../../../../src/verticals/ecommerce/adapters/toast/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeSelection(overrides: Partial<RawToastSelection> = {}): RawToastSelection {
  return {
    guid: '2e917d92-04e5-4a2b-bb1a-bde41009feb3',
    entityType: 'MenuItemSelection',
    preDiscountPrice: 111,
    displayName: 'Rejected',
    selectionType: 'NONE',
    price: 111,
    voided: false,
    item: {
      guid: '88aebc5f-4635-4141-9c0f-5a9be6324218',
      entityType: 'MenuItem',
      externalId: null,
    },
    quantity: 1,
    tax: 0,
    ...overrides,
  }
}

function makeCheck(overrides: Partial<RawToastCheck> = {}): RawToastCheck {
  return {
    guid: 'df38b30c-04b3-4eb3-923e-7cec05357674',
    entityType: 'Check',
    displayNumber: 'pdesjardins-api-1583176621',
    payments: [],
    voided: false,
    paymentStatus: 'OPEN',
    amount: 111,
    totalAmount: 111,
    selections: [makeSelection()],
    deleted: false,
    taxAmount: 0,
    customer: {
      firstName: 'Jack',
      lastName: 'Jones',
      phone: '333-555-5555',
      email: 'jack@example.com',
    },
    ...overrides,
  }
}

function makeOrder(overrides: Partial<RawToastOrder> = {}): RawToastOrder {
  return {
    guid: '5274c0f8-bf61-4e37-ad04-cf4ca1326822',
    entityType: 'Order',
    source: 'API',
    voidDate: null,
    businessDate: 20200302,
    paidDate: null,
    voided: false,
    approvalStatus: 'FUTURE',
    openedDate: '2020-03-02T19:17:02.552+0000',
    checks: [makeCheck()],
    deleted: false,
    closedDate: null,
    modifiedDate: '2020-03-02T19:17:02.612+0000',
    promisedDate: '2020-03-03T19:55:00.000+0000',
    ...overrides,
  }
}

describe('transformOrder (Toast)', () => {
  it('maps the documented example and parses as an Order', () => {
    const raw = makeOrder()
    const result = OrderSchema.parse(transformOrder(raw, 'USD'))
    expect(result.id).toBe('5274c0f8-bf61-4e37-ad04-cf4ca1326822')
    expect(result.currency).toBe('USD')
    // check totalAmount 111 (decimal major units) → 11100 minor units
    expect(result.totalPrice).toEqual({ amount: 11100, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 0, currency: 'USD' })
    expect(result.financialStatus).toBe('PENDING')
    expect(result.email).toBe('jack@example.com')
    expect(result.phone).toBe('333-555-5555')
    expect(result.customerId).toBeUndefined()
    expect(result.updatedAt).toBe('2020-03-02T19:17:02.612Z')
    expect(result.cancelledAt).toBeUndefined()
    expect(result.metadata).toEqual(raw)
  })

  it('omits a line item whose unit price (receiptLinePrice) is undocumented in the payload', () => {
    // The documented example selection carries no receiptLinePrice.
    const result = OrderSchema.parse(transformOrder(makeOrder(), 'USD'))
    expect(result.lineItems).toBeUndefined()
  })

  it('maps a selection with receiptLinePrice to a line item', () => {
    const raw = makeOrder({
      checks: [makeCheck({ selections: [makeSelection({ receiptLinePrice: 55.5, quantity: 2 })] })],
    })
    const result = OrderSchema.parse(transformOrder(raw, 'USD'))
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('2e917d92-04e5-4a2b-bb1a-bde41009feb3')
    expect(li.productId).toBe('88aebc5f-4635-4141-9c0f-5a9be6324218')
    expect(li.title).toBe('Rejected')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 5550, currency: 'USD' })
  })

  it('leaves out voided selections and weighed (fractional) quantities', () => {
    const raw = makeOrder({
      checks: [
        makeCheck({
          selections: [
            makeSelection({ guid: 'a', receiptLinePrice: 1, voided: true }),
            makeSelection({ guid: 'b', receiptLinePrice: 1, quantity: 0.75 }),
            makeSelection({ guid: 'c', receiptLinePrice: 1 }),
          ],
        }),
      ],
    })
    expect(transformOrder(raw, 'USD').lineItems?.map((l) => l.id)).toEqual(['c'])
  })

  it('omits every money field and line item when the currency is unknown', () => {
    const raw = makeOrder({
      checks: [makeCheck({ selections: [makeSelection({ receiptLinePrice: 5 })] })],
    })
    const result = OrderSchema.parse(transformOrder(raw, undefined))
    expect(result.currency).toBeUndefined()
    expect(result.totalPrice).toBeUndefined()
    expect(result.totalTax).toBeUndefined()
    expect(result.lineItems).toBeUndefined()
  })

  it('omits a total unless every check reports it', () => {
    const raw = makeOrder({ checks: [makeCheck(), makeCheck({ guid: 'x', totalAmount: null })] })
    expect(transformOrder(raw, 'USD').totalPrice).toBeUndefined()
  })

  it('sums totals over checks and ignores deleted checks', () => {
    const raw = makeOrder({
      checks: [
        makeCheck({ totalAmount: 10.5, taxAmount: 0.5 }),
        makeCheck({ guid: 'c2', totalAmount: 4.25, taxAmount: 0.25 }),
        makeCheck({ guid: 'c3', totalAmount: 99, taxAmount: 9, deleted: true }),
      ],
    })
    const result = OrderSchema.parse(transformOrder(raw, 'USD'))
    expect(result.totalPrice).toEqual({ amount: 1475, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 75, currency: 'USD' })
  })

  it('maps check payment statuses and payment refund statuses', () => {
    const paid = makeOrder({
      checks: [
        makeCheck({ paymentStatus: 'CLOSED' }),
        makeCheck({ guid: 'c2', paymentStatus: 'PAID' }),
      ],
    })
    expect(transformOrder(paid, 'USD').financialStatus).toBe('PAID')
    const partial = makeOrder({
      checks: [
        makeCheck({ paymentStatus: 'CLOSED' }),
        makeCheck({ guid: 'c2', paymentStatus: 'OPEN' }),
      ],
    })
    expect(transformOrder(partial, 'USD').financialStatus).toBe('PARTIALLY_PAID')
    const refunded = makeOrder({
      checks: [
        makeCheck({ paymentStatus: 'CLOSED', payments: [{ guid: 'p1', refundStatus: 'FULL' }] }),
      ],
    })
    expect(transformOrder(refunded, 'USD').financialStatus).toBe('REFUNDED')
    const partRefund = makeOrder({
      checks: [
        makeCheck({
          paymentStatus: 'CLOSED',
          payments: [
            { guid: 'p1', refundStatus: 'PARTIAL' },
            { guid: 'p2', refundStatus: 'NONE' },
          ],
        }),
      ],
    })
    const result = transformOrder(partRefund, 'USD')
    expect(result.financialStatus).toBe('PARTIALLY_REFUNDED')
    expect(result.transactionIds).toEqual(['p1', 'p2'])
  })

  it('leaves the financial status unset when a check has no documented payment status', () => {
    // Check.paymentStatus is a wire-safe enum of OPEN, PAID and CLOSED; a
    // check without one says nothing about what is owed.
    const raw = makeOrder({
      checks: [
        makeCheck({ paymentStatus: 'CLOSED' }),
        makeCheck({ guid: 'c2', paymentStatus: null }),
      ],
    })
    expect(OrderSchema.parse(transformOrder(raw, 'USD')).financialStatus).toBeUndefined()
  })

  it('gives a deleted (combined-away) order no totals, lines, payments or status', () => {
    // Order.deleted: "if you combine a check into another order, the original
    // order for the check is deleted." The check is counted on that order.
    const raw = makeOrder({
      deleted: true,
      checks: [
        makeCheck({
          paymentStatus: 'CLOSED',
          payments: [{ guid: 'p1', refundStatus: 'NONE' }],
          selections: [makeSelection({ receiptLinePrice: 5 })],
        }),
      ],
    })
    const result = OrderSchema.parse(transformOrder(raw, 'USD'))
    expect(result.id).toBe('5274c0f8-bf61-4e37-ad04-cf4ca1326822')
    expect(result.totalPrice).toBeUndefined()
    expect(result.totalTax).toBeUndefined()
    expect(result.lineItems).toBeUndefined()
    expect(result.transactionIds).toBeUndefined()
    expect(result.financialStatus).toBeUndefined()
    expect(result.metadata).toEqual(raw)
  })

  it('maps a voided order to VOIDED with cancelledAt', () => {
    const raw = makeOrder({ voided: true, voidDate: '2020-03-02T20:00:00.000+0000' })
    const result = OrderSchema.parse(transformOrder(raw, 'USD'))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.cancelledAt).toBe('2020-03-02T20:00:00.000Z')
  })

  it('drops an email the canonical schema would reject', () => {
    const raw = makeOrder({ checks: [makeCheck({ customer: { email: 'not-an-email' } })] })
    expect(OrderSchema.parse(transformOrder(raw, 'USD')).email).toBeUndefined()
  })

  it('untransformOrder keeps selections', () => {
    const raw = makeOrder({
      checks: [makeCheck({ selections: [makeSelection({ receiptLinePrice: 5, quantity: 2 })] })],
    })
    const body = untransformOrder(transformOrder(raw, 'USD'))
    const checks = body['checks'] as Array<Record<string, unknown>>
    const selections = checks[0]!['selections'] as Array<Record<string, unknown>>
    expect(selections[0]!['displayName']).toBe('Rejected')
    expect(selections[0]!['quantity']).toBe(2)
  })
})

describe('restaurantCurrency / toastMoney', () => {
  it('reads General.currencyCode and rejects a non-ISO value', () => {
    expect(restaurantCurrency({ general: { currencyCode: 'CAD' } })).toBe('CAD')
    expect(restaurantCurrency({ general: { currencyCode: 'dollars' } })).toBeUndefined()
    expect(restaurantCurrency({ general: {} })).toBeUndefined()
    expect(restaurantCurrency(undefined)).toBeUndefined()
  })

  it('needs both an amount and a currency', () => {
    expect(toastMoney(57.73, 'USD')).toEqual({ amount: 5773, currency: 'USD' })
    expect(toastMoney(57.73, undefined)).toBeUndefined()
    expect(toastMoney(null, 'USD')).toBeUndefined()
  })
})
