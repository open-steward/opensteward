import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  untransformTransaction,
  type RawShopifyTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/sellfy/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeTransaction(overrides: Partial<RawShopifyTransaction> = {}): RawShopifyTransaction {
  return {
    id: 8001,
    order_id: 1001,
    kind: 'sale',
    status: 'success',
    amount: '49.99',
    currency: 'USD',
    gateway: 'stripe',
    authorization: 'auth_abc123',
    parent_id: null,
    error_code: null,
    message: null,
    processed_at: '2024-05-01T12:05:00Z',
    created_at: '2024-05-01T12:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('8001')
    expect(typeof result.id).toBe('string')
    expect(result.orderId).toBe('1001')
  })

  it('maps kind sale to SALE', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.kind).toBe('SALE')
  })

  it('maps status success to SUCCESS', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.status).toBe('SUCCESS')
  })

  it('converts amount to minor units with currency', () => {
    const result = transformTransaction(makeTransaction())
    // $49.99 → 4999 cents
    expect(result.amount).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('maps gateway and authorizationCode', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.gateway).toBe('stripe')
    expect(result.authorizationCode).toBe('auth_abc123')
  })

  it('maps kind authorization to AUTHORIZATION', () => {
    const result = transformTransaction(makeTransaction({ kind: 'authorization' }))
    expect(result.kind).toBe('AUTHORIZATION')
  })

  it('maps kind capture to CAPTURE', () => {
    const result = transformTransaction(makeTransaction({ kind: 'capture' }))
    expect(result.kind).toBe('CAPTURE')
  })

  it('maps kind refund to REFUND', () => {
    const result = transformTransaction(makeTransaction({ kind: 'refund' }))
    expect(result.kind).toBe('REFUND')
  })

  it('maps kind void to VOID', () => {
    const result = transformTransaction(makeTransaction({ kind: 'void' }))
    expect(result.kind).toBe('VOID')
  })

  it('maps status failure to FAILURE', () => {
    const result = transformTransaction(makeTransaction({ status: 'failure' }))
    expect(result.status).toBe('FAILURE')
  })

  it('maps status error to ERROR', () => {
    const result = transformTransaction(makeTransaction({ status: 'error' }))
    expect(result.status).toBe('ERROR')
  })

  it('maps status pending to PENDING', () => {
    const result = transformTransaction(makeTransaction({ status: 'pending' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps parentTransactionId when present', () => {
    const result = transformTransaction(makeTransaction({ parent_id: 7000 }))
    expect(result.parentTransactionId).toBe('7000')
  })

  it('maps error fields', () => {
    const result = transformTransaction(
      makeTransaction({ error_code: 'card_declined', message: 'Card was declined.' }),
    )
    expect(result.errorCode).toBe('card_declined')
    expect(result.errorMessage).toBe('Card was declined.')
  })

  it('defaults to USD when currency is not provided', () => {
    const result = transformTransaction(makeTransaction({ currency: undefined }))
    expect(result.amount?.currency).toBe('USD')
  })

  it('maps processedAt and createdAt', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.processedAt).toBe('2024-05-01T12:05:00Z')
    expect(result.createdAt).toBe('2024-05-01T12:00:00Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeTransaction()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformTransaction', () => {
    const canonical = transformTransaction(makeTransaction())
    const raw = untransformTransaction(canonical)
    expect(raw.kind).toBe('sale')
    expect(raw.gateway).toBe('stripe')
  })
})
