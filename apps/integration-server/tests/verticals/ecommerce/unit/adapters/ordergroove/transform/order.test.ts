/**
 * Ordergroove Order → canonical Order.
 *
 * Raw shape confirmed verbatim at
 * https://developer.ordergroove.com/reference/orders-retrieve, including the
 * `currency_code` field (Response Body Definitions table: "currency_code ·
 * string · Three letter ISO currency code · \"USD\""); status codes at
 * https://developer.ordergroove.com/reference/order-status-codes.
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawOrdergrooveOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/ordergroove/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawOrdergrooveOrder> = {}): RawOrdergrooveOrder {
  return {
    merchant: 'ac4f7938383a11e89ecbbc764e1107f2',
    customer: '00026001',
    payment: '070001bc02fd11e99542bc764e1043b0',
    shipping_address: '66c25cd0564011e9abc5bc764e107990',
    public_id: 'c4e05d04ccc411e8ada3bc764e101db1',
    currency_code: 'USD',
    sub_total: '22.90',
    tax_total: '0.00',
    shipping_total: '5.99',
    discount_total: '21.08',
    total: '28.89',
    created: '2018-10-10 14:43:32',
    updated: '2018-10-22 14:05:02',
    place: '2019-06-06 12:08:37',
    cancelled: null,
    status: 5,
    type: 1,
    ...overrides,
  }
}

describe('ordergroove transformOrder', () => {
  it('maps public_id as the canonical id — matches the /orders/{public_id}/cancel/ path segment', () => {
    expect(transformOrder(makeOrder()).id).toBe('c4e05d04ccc411e8ada3bc764e101db1')
  })

  it('maps customer to customerId', () => {
    expect(transformOrder(makeOrder()).customerId).toBe('00026001')
  })

  it('converts decimal-string totals to integer minor units under the documented currency_code', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('USD')
    expect(result.subtotalPrice).toEqual({ amount: 2290, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 0, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 599, currency: 'USD' })
    expect(result.totalDiscounts).toEqual({ amount: 2108, currency: 'USD' })
    expect(result.totalPrice).toEqual({ amount: 2889, currency: 'USD' })
  })

  it('respects a non-USD currency_code rather than hardcoding USD', () => {
    const result = transformOrder(makeOrder({ currency_code: 'EUR' }))
    expect(result.currency).toBe('EUR')
    expect(result.subtotalPrice).toEqual({ amount: 2290, currency: 'EUR' })
  })

  it('omits currency AND every money field together when currency_code is absent — never defaults to USD', () => {
    const result = transformOrder(makeOrder({ currency_code: null }))
    expect(result.currency).toBeUndefined()
    expect(result.subtotalPrice).toBeUndefined()
    expect(result.totalTax).toBeUndefined()
    expect(result.totalShipping).toBeUndefined()
    expect(result.totalDiscounts).toBeUndefined()
    expect(result.totalPrice).toBeUndefined()
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('maps status 5 (SUCCESS) to PAID', () => {
    expect(transformOrder(makeOrder({ status: 5 })).financialStatus).toBe('PAID')
  })

  it('maps status 4 (CANCELLED) and 3 (REJECTED) to VOIDED', () => {
    expect(transformOrder(makeOrder({ status: 4 })).financialStatus).toBe('VOIDED')
    expect(transformOrder(makeOrder({ status: 3 })).financialStatus).toBe('VOIDED')
  })

  it('maps status 1 (UNSENT) to PENDING', () => {
    expect(transformOrder(makeOrder({ status: 1 })).financialStatus).toBe('PENDING')
  })

  it('maps an undocumented-here status code to unknown rather than dropping it', () => {
    expect(transformOrder(makeOrder({ status: 20 })).financialStatus).toBe('unknown')
  })

  it('maps created/updated/place/cancelled timestamps to ISO 8601 UTC', () => {
    const result = transformOrder(makeOrder({ cancelled: '2019-04-05 12:13:32' }))
    expect(result.createdAt).toBe('2018-10-10T14:43:32.000Z')
    expect(result.updatedAt).toBe('2018-10-22T14:05:02.000Z')
    expect(result.processedAt).toBe('2019-06-06T12:08:37.000Z')
    expect(result.cancelledAt).toBe('2019-04-05T12:13:32.000Z')
  })

  it('omits cancelledAt when cancelled is null', () => {
    expect(transformOrder(makeOrder({ cancelled: null })).cancelledAt).toBeUndefined()
  })

  it('maps rejected_message to cancelReason when non-empty', () => {
    expect(transformOrder(makeOrder({ rejected_message: 'card declined' })).cancelReason).toBe(
      'card declined',
    )
    expect(transformOrder(makeOrder({ rejected_message: '' })).cancelReason).toBeUndefined()
  })

  it('preserves the raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
