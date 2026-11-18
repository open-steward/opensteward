import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawLightspeedSale,
} from '../../../../../../../src/verticals/ecommerce/adapters/lightspeed-retail/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefundSale(overrides: Partial<RawLightspeedSale> = {}): RawLightspeedSale {
  return {
    saleID: '6001',
    referenceNumber: '5001',
    voided: 'true',
    completed: 'true',
    calcTotal: '-29.98',
    createTime: '2024-05-10T10:00:00+00:00',
    timeStamp: '2024-05-10T10:05:00+00:00',
    completeTime: '2024-05-10T10:03:00+00:00',
    shopID: '1',
    SalePayments: {
      SalePayment: [
        {
          salePaymentID: 'SP_R01',
          paymentTypeID: '1',
          amount: '-29.98',
          createTime: '2024-05-10T10:02:00+00:00',
        },
      ],
    },
    ...overrides,
  }
}

describe('transformRefund (Lightspeed Retail)', () => {
  it('maps core fields', () => {
    const result = transformRefund(makeRefundSale())
    expect(result.id).toBe('6001')
    expect(result.orderId).toBe('5001')
    expect(result.amount).toEqual({ amount: 2998, currency: 'USD' })
    expect(result.reason).toBe('voided')
  })

  it('uses absolute value of negative total', () => {
    const result = transformRefund(makeRefundSale({ calcTotal: '-15.50' }))
    expect(result.amount?.amount).toBe(1550)
  })

  it('maps transaction ids from payments', () => {
    const result = transformRefund(makeRefundSale())
    expect(result.transactionIds).toEqual(['SP_R01'])
  })

  it('maps processedAt from completeTime', () => {
    const result = transformRefund(makeRefundSale())
    expect(result.processedAt).toBe('2024-05-10T10:03:00+00:00')
  })

  it('handles missing payments', () => {
    const result = transformRefund(makeRefundSale({ SalePayments: undefined }))
    expect(result.transactionIds).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRefundSale()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const result = transformRefund(makeRefundSale())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformRefund', () => {
    const canonical = transformRefund(makeRefundSale())
    const raw = untransformRefund(canonical, '1')
    expect(raw['shopID']).toBe('1')
    expect(raw['referenceNumber']).toBe('5001')
  })
})
