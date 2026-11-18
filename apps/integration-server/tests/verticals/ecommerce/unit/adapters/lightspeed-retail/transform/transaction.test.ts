import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawLightspeedSalePayment,
} from '../../../../../../../src/verticals/ecommerce/adapters/lightspeed-retail/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makePayment(
  overrides: Partial<RawLightspeedSalePayment> = {},
): RawLightspeedSalePayment {
  return {
    salePaymentID: 'SP_001',
    saleID: '5001',
    paymentTypeID: '1',
    amount: '29.98',
    createTime: '2024-05-01T11:00:00+00:00',
    timeStamp: '2024-05-01T11:00:00+00:00',
    PaymentType: {
      paymentTypeID: '1',
      name: 'Credit Card',
    },
    ...overrides,
  }
}

describe('transformTransaction (Lightspeed Retail)', () => {
  it('maps core fields', () => {
    const result = transformTransaction(makePayment())
    expect(result.id).toBe('SP_001')
    expect(result.orderId).toBe('5001')
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('SUCCESS')
    expect(result.amount).toEqual({ amount: 2998, currency: 'USD' })
  })

  it('maps gateway from payment type name', () => {
    const result = transformTransaction(makePayment())
    expect(result.gateway).toBe('lightspeed_credit card')
  })

  it('defaults gateway when PaymentType is missing', () => {
    const result = transformTransaction(makePayment({ PaymentType: undefined }))
    expect(result.gateway).toBe('lightspeed_lightspeed')
  })

  it('maps zero amount', () => {
    const result = transformTransaction(makePayment({ amount: '0' }))
    expect(result.amount).toEqual({ amount: 0, currency: 'USD' })
  })

  it('handles undefined amount as PENDING', () => {
    const result = transformTransaction(makePayment({ amount: undefined }))
    expect(result.status).toBe('PENDING')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makePayment()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const result = transformTransaction(makePayment())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
