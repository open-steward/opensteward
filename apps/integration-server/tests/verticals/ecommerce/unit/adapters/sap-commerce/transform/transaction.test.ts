import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  untransformTransaction,
  type RawSapPaymentTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/sap-commerce/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeTx(overrides: Partial<RawSapPaymentTransaction> = {}): RawSapPaymentTransaction {
  return {
    id: 'tx-001',
    code: 'PAY-001',
    paymentProvider: 'cybersource',
    amount: { value: 3605.67, currencyIso: 'EUR' },
    transactionType: 'CAPTURE',
    transactionStatus: 'ACCEPTED',
    time: '2024-06-01T10:05:00.000Z',
    ...overrides,
  }
}

describe('transformTransaction (sap-commerce)', () => {
  it('maps core fields', () => {
    const r = transformTransaction(makeTx(), 'ORD-10001')
    expect(r.id).toBe('tx-001')
    expect(r.orderId).toBe('ORD-10001')
    expect(r.gateway).toBe('cybersource')
  })

  it('maps transaction kind from type', () => {
    expect(transformTransaction(makeTx({ transactionType: 'CAPTURE' })).kind).toBe('CAPTURE')
    expect(transformTransaction(makeTx({ transactionType: 'AUTHORIZATION' })).kind).toBe('AUTHORIZATION')
    expect(transformTransaction(makeTx({ transactionType: 'REFUND' })).kind).toBe('REFUND')
    expect(transformTransaction(makeTx({ transactionType: 'VOID' })).kind).toBe('VOID')
    expect(transformTransaction(makeTx({ transactionType: 'SALE' })).kind).toBe('SALE')
  })

  it('maps transaction status', () => {
    expect(transformTransaction(makeTx({ transactionStatus: 'ACCEPTED' })).status).toBe('SUCCESS')
    expect(transformTransaction(makeTx({ transactionStatus: 'REJECTED' })).status).toBe('FAILURE')
    expect(transformTransaction(makeTx({ transactionStatus: 'ERROR' })).status).toBe('ERROR')
    expect(transformTransaction(makeTx({ transactionStatus: 'REVIEW' })).status).toBe('PENDING')
  })

  it('maps amount', () => {
    const r = transformTransaction(makeTx())
    expect(r.amount).toEqual({ amount: 360567, currency: 'EUR' })
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeTx()
    const r = transformTransaction(raw)
    expect(r.metadata).toBe(raw)
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const r = transformTransaction(makeTx(), 'ORD-10001')
    expect(() => TransactionSchema.parse(r)).not.toThrow()
  })
})

describe('untransformTransaction (sap-commerce)', () => {
  it('builds transaction body', () => {
    const body = untransformTransaction({
      gateway: 'stripe',
      amount: { amount: 10000, currency: 'USD' },
      kind: 'CAPTURE',
    }) as Record<string, unknown>
    expect(body['paymentProvider']).toBe('stripe')
    expect(body['transactionType']).toBe('CAPTURE')
    const amt = body['amount'] as Record<string, unknown>
    expect(amt['value']).toBe(100)
  })
})
