import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  transformPaymentRefunds,
  untransformRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/commercetools/transform/refund'
import type {
  RawCtPayment,
  RawCtTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/commercetools/transform/transaction'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makePayment(overrides: Partial<RawCtPayment> = {}): RawCtPayment {
  return {
    id: 'pay-1',
    version: 3,
    transactions: [
      {
        id: 'tx-charge',
        type: 'Charge',
        amount: { centAmount: 10000, currencyCode: 'USD', fractionDigits: 2 },
        state: 'Success',
      },
      {
        id: 'tx-refund',
        type: 'Refund',
        amount: { centAmount: 2500, currencyCode: 'USD', fractionDigits: 2 },
        state: 'Success',
        timestamp: '2024-05-02T10:00:00Z',
      },
    ],
    createdAt: '2024-05-01T10:00:00Z',
    ...overrides,
  }
}

describe('transformRefund (commercetools)', () => {
  it('transformRefund maps an individual refund transaction', () => {
    const pay = makePayment()
    const tx = pay.transactions[1] as RawCtTransaction
    const r = transformRefund(pay, tx, 'order-1')
    expect(r.id).toBe('pay-1:tx-refund')
    expect(r.orderId).toBe('order-1')
    expect(r.amount).toEqual({ amount: 2500, currency: 'USD' })
    expect(r.processedAt).toBe('2024-05-02T10:00:00Z')
  })

  it('transformPaymentRefunds filters out non-refund transactions', () => {
    const refunds = transformPaymentRefunds(makePayment(), 'order-1')
    expect(refunds).toHaveLength(1)
    expect(refunds[0]!.id).toBe('pay-1:tx-refund')
  })

  it('treats Chargeback transactions as refunds', () => {
    const pay = makePayment({
      transactions: [
        {
          id: 'tx-cb',
          type: 'Chargeback',
          amount: { centAmount: 10000, currencyCode: 'USD', fractionDigits: 2 },
          state: 'Success',
        },
      ],
    })
    const refunds = transformPaymentRefunds(pay, 'order-1')
    expect(refunds).toHaveLength(1)
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const refunds = transformPaymentRefunds(makePayment(), 'order-1')
    expect(() => RefundSchema.parse(refunds[0])).not.toThrow()
  })

  it('untransformRefund builds an addTransaction body', () => {
    const raw = untransformRefund({ amount: { amount: 2500, currency: 'USD' } })
    expect(raw['type']).toBe('Refund')
    const amount = raw['amount'] as { centAmount: number }
    expect(amount.centAmount).toBe(2500)
  })
})
