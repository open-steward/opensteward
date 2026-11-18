/**
 * Fixtures follow `RefundDetails` / `Refund` from the OrderManagement OpenAPI
 * embedded in https://docs.brinkcommerce.com/technical/api-references/order/refunds.md.
 * A refund has no currency of its own; `RefundOrderLine` and
 * `RefundShippingFee` each require `currencyCode`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawBrinkRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/brink-commerce/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

const raw: RawBrinkRefund = {
  id: '9a4c2e1f-3b5d-4c7e-8f90-1a2b3c4d5e6f',
  orderId: '2b7d1c52-5a8e-4a3f-9f55-0c1e6f3b2a10',
  orderReference: '100042',
  paymentProvider: { providerId: 'kco', providerName: 'KlarnaCheckout' },
  reason: { code: 'RETURN', cause: 'Wrong size' },
  orderLines: [
    {
      orderLineId: '6f1a8c3e-1d2b-4e5f-8a9b-0c1d2e3f4a5b',
      quantity: 1,
      currencyCode: 'SEK',
      taxPercentage: 2500,
      taxPercentageDecimals: 2,
      totalAmount: 25000,
      totalTaxAmount: 5000,
      totalDiscountAmount: 0,
      deliveries: [],
    },
  ],
  shippingFees: [],
  gifts: [],
  giftCards: [],
  giftCardProducts: [],
  totals: {
    subTotal: 25000,
    taxTotal: 5000,
    shippingTotal: 0,
    giftCardTotal: 0,
    bonusTotal: 0,
    grandTotal: 25000,
  },
  created: '2024-03-05T12:00:00Z',
  updated: '2024-03-05T12:10:00Z',
  completed: '2024-03-05T12:10:00Z',
  revision: 1,
}

describe('transformRefund (brink-commerce)', () => {
  it('parses against RefundSchema', () => {
    expect(() => RefundSchema.parse(transformRefund(raw))).not.toThrow()
  })

  it('maps ids, grandTotal in the lines currency, cause, lines and timestamps', () => {
    expect(transformRefund(raw)).toMatchObject({
      id: raw.id,
      orderId: raw.orderId,
      amount: { amount: 25000, currency: 'SEK' },
      reason: 'Wrong size',
      refundLineItems: [{ lineItemId: '6f1a8c3e-1d2b-4e5f-8a9b-0c1d2e3f4a5b', quantity: 1 }],
      processedAt: '2024-03-05T12:10:00.000Z',
      createdAt: '2024-03-05T12:00:00.000Z',
    })
  })

  it('omits the amount when no line or fee names a currency', () => {
    const out = transformRefund({ ...raw, orderLines: [], shippingFees: [] })
    expect(out.amount).toBeUndefined()
    expect(() => RefundSchema.parse(out)).not.toThrow()
  })

  it('takes the currency from a shipping fee when there are no lines', () => {
    const out = transformRefund({
      ...raw,
      orderLines: [],
      shippingFees: [{ shippingFeeId: 'fee-1', currencyCode: 'NOK' }],
    })
    expect(out.amount).toEqual({ amount: 25000, currency: 'NOK' })
  })

  it('omits the amount when lines disagree on currency', () => {
    const out = transformRefund({
      ...raw,
      shippingFees: [{ shippingFeeId: 'fee-1', currencyCode: 'EUR' }],
    })
    expect(out.amount).toBeUndefined()
  })
})

describe('untransformRefund (brink-commerce)', () => {
  it('maps reason and orderLines', () => {
    const body = untransformRefund({
      reason: 'Damaged',
      refundLineItems: [{ lineItemId: 'li-1', quantity: 1 }],
    })
    expect(body['reason']).toEqual({ cause: 'Damaged' })
    expect(body['orderLines']).toEqual([{ orderLineId: 'li-1', quantity: 1 }])
  })
})
