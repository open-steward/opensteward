import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  untransformTransaction,
  type RawBCTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/bettercommerce/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeTransaction(overrides: Partial<RawBCTransaction> = {}): RawBCTransaction {
  return {
    transactionId: 'txn-001',
    orderId: 'order-001',
    transactionType: 'sale',
    status: 'paid',
    amount: 59.98,
    currencyCode: 'GBP',
    gateway: 'stripe',
    authCode: 'AUTH-XYZ',
    paymentDate: '2024-03-01T00:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction (BetterCommerce)', () => {
  it('maps transactionId to id', () => {
    const result = transformTransaction(makeTransaction({ transactionId: 'txn-001' }))
    expect(result.id).toBe('txn-001')
  })

  it('falls back to recordId', () => {
    const result = transformTransaction(
      makeTransaction({ transactionId: undefined, recordId: 'rec-abc' }),
    )
    expect(result.id).toBe('rec-abc')
  })

  it('maps orderId', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.orderId).toBe('order-001')
  })

  it('maps transactionType=sale to SALE', () => {
    const result = transformTransaction(makeTransaction({ transactionType: 'sale' }))
    expect(result.kind).toBe('SALE')
  })

  it('maps transactionType=payment to SALE', () => {
    const result = transformTransaction(makeTransaction({ transactionType: 'payment' }))
    expect(result.kind).toBe('SALE')
  })

  it('maps transactionType=authorization to AUTHORIZATION', () => {
    const result = transformTransaction(makeTransaction({ transactionType: 'authorization' }))
    expect(result.kind).toBe('AUTHORIZATION')
  })

  it('maps transactionType=capture to CAPTURE', () => {
    const result = transformTransaction(makeTransaction({ transactionType: 'capture' }))
    expect(result.kind).toBe('CAPTURE')
  })

  it('maps transactionType=refund to REFUND', () => {
    const result = transformTransaction(makeTransaction({ transactionType: 'refund' }))
    expect(result.kind).toBe('REFUND')
  })

  it('maps status=paid to SUCCESS', () => {
    const result = transformTransaction(makeTransaction({ status: 'paid' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps status=failed to FAILURE', () => {
    const result = transformTransaction(makeTransaction({ status: 'failed' }))
    expect(result.status).toBe('FAILURE')
  })

  it('maps status=pending to PENDING', () => {
    const result = transformTransaction(makeTransaction({ status: 'pending' }))
    expect(result.status).toBe('PENDING')
  })

  it('converts amount to minor units', () => {
    const result = transformTransaction(makeTransaction({ amount: 59.98, currencyCode: 'GBP' }))
    expect(result.amount?.amount).toBe(5998)
    expect(result.amount?.currency).toBe('GBP')
  })

  it('falls back to paidAmount when amount is absent', () => {
    const result = transformTransaction(makeTransaction({ amount: undefined, paidAmount: 59.98 }))
    expect(result.amount?.amount).toBe(5998)
  })

  it('maps gateway', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.gateway).toBe('stripe')
  })

  it('falls back to paymentGateway', () => {
    const result = transformTransaction(
      makeTransaction({ gateway: undefined, paymentGateway: 'paypal' }),
    )
    expect(result.gateway).toBe('paypal')
  })

  it('maps authCode to authorizationCode', () => {
    const result = transformTransaction(makeTransaction({ authCode: 'AUTH-XYZ' }))
    expect(result.authorizationCode).toBe('AUTH-XYZ')
  })

  it('maps paymentDate to processedAt', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.processedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('stores raw in metadata', () => {
    const raw = makeTransaction()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying TransactionSchema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})

describe('untransformTransaction (BetterCommerce)', () => {
  it('maps kind to lowercase transactionType', () => {
    const body = untransformTransaction({ kind: 'SALE' })
    expect(body.transactionType).toBe('sale')
  })

  it('converts minor-unit amount to major-unit decimal', () => {
    const body = untransformTransaction({ amount: { amount: 5998, currency: 'GBP' } })
    expect(body.amount).toBe(59.98)
    expect(body.currencyCode).toBe('GBP')
  })

  it('maps gateway', () => {
    const body = untransformTransaction({ gateway: 'stripe' })
    expect(body.gateway).toBe('stripe')
  })
})
