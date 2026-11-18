import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  transformPayment,
  untransformTransaction,
  type RawCtPayment,
  type RawCtTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/commercetools/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makePayment(overrides: Partial<RawCtPayment> = {}): RawCtPayment {
  return {
    id: 'pay-1',
    version: 2,
    amountPlanned: { type: 'centPrecision', centAmount: 10000, currencyCode: 'USD', fractionDigits: 2 },
    paymentMethodInfo: { paymentInterface: 'stripe', method: 'card' },
    transactions: [
      {
        id: 'tx-auth',
        type: 'Authorization',
        amount: { type: 'centPrecision', centAmount: 10000, currencyCode: 'USD', fractionDigits: 2 },
        state: 'Success',
        timestamp: '2024-05-01T10:00:00Z',
      },
      {
        id: 'tx-charge',
        type: 'Charge',
        amount: { type: 'centPrecision', centAmount: 10000, currencyCode: 'USD', fractionDigits: 2 },
        state: 'Success',
        timestamp: '2024-05-01T10:05:00Z',
      },
    ],
    createdAt: '2024-05-01T10:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction (commercetools)', () => {
  it('maps Authorization to AUTHORIZATION with composite id', () => {
    const pay = makePayment()
    const r = transformTransaction(pay, pay.transactions[0] as RawCtTransaction, 'order-1')
    expect(r.id).toBe('pay-1:tx-auth')
    expect(r.kind).toBe('AUTHORIZATION')
    expect(r.status).toBe('SUCCESS')
    expect(r.amount).toEqual({ amount: 10000, currency: 'USD' })
    expect(r.gateway).toBe('stripe')
  })

  it('maps Charge to CAPTURE and Refund to REFUND', () => {
    const pay = makePayment({
      transactions: [
        {
          id: 'tx-r',
          type: 'Refund',
          amount: { type: 'centPrecision', centAmount: 500, currencyCode: 'USD', fractionDigits: 2 },
          state: 'Success',
        },
      ],
    })
    const r = transformTransaction(pay, pay.transactions[0] as RawCtTransaction)
    expect(r.kind).toBe('REFUND')
  })

  it('transformPayment expands all transactions at once', () => {
    const r = transformPayment(makePayment(), 'order-1')
    expect(r).toHaveLength(2)
    expect(r.map((t) => t.kind)).toEqual(['AUTHORIZATION', 'CAPTURE'])
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const pay = makePayment()
    const r = transformTransaction(pay, pay.transactions[0] as RawCtTransaction)
    expect(() => TransactionSchema.parse(r)).not.toThrow()
  })

  it('round-trips writable fields via untransformTransaction', () => {
    const pay = makePayment()
    const canonical = transformTransaction(pay, pay.transactions[1] as RawCtTransaction)
    const raw = untransformTransaction(canonical) as Record<string, unknown>
    expect(raw['type']).toBe('Charge')
    const amount = raw['amount'] as { centAmount: number; currencyCode: string }
    expect(amount.centAmount).toBe(10000)
  })
})
