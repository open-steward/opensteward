import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  untransformTransaction,
  type RawShoplineTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopline/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeRaw(overrides: Partial<RawShoplineTransaction> = {}): RawShoplineTransaction {
  return {
    id: 6001,
    order_id: 1001,
    kind: 'sale',
    status: 'success',
    amount: '108.24',
    currency: 'USD',
    gateway: 'shopline_payments',
    authorization: 'AUTH-ABC123',
    parent_id: null,
    error_code: null,
    message: null,
    processed_at: '2024-01-15T10:00:00.000Z',
    created_at: '2024-01-15T10:00:00.000Z',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id and orderId as strings', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('6001')
    expect(result.orderId).toBe('1001')
  })

  it('maps kind and status to canonical enum values', () => {
    const result = transformTransaction(makeRaw())
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps all kind values', () => {
    expect(transformTransaction(makeRaw({ kind: 'authorization' })).kind).toBe('AUTHORIZATION')
    expect(transformTransaction(makeRaw({ kind: 'capture' })).kind).toBe('CAPTURE')
    expect(transformTransaction(makeRaw({ kind: 'refund' })).kind).toBe('REFUND')
    expect(transformTransaction(makeRaw({ kind: 'void' })).kind).toBe('VOID')
  })

  it('converts amount to minor units', () => {
    const result = transformTransaction(makeRaw())
    // 108.24 USD → 10824 cents
    expect(result.amount).toEqual({ amount: 10824, currency: 'USD' })
  })

  it('maps gateway and authorizationCode', () => {
    const result = transformTransaction(makeRaw())
    expect(result.gateway).toBe('shopline_payments')
    expect(result.authorizationCode).toBe('AUTH-ABC123')
  })

  it('maps parentTransactionId when present', () => {
    const result = transformTransaction(makeRaw({ parent_id: 5000 }))
    expect(result.parentTransactionId).toBe('5000')
  })

  it('omits parentTransactionId when null', () => {
    const result = transformTransaction(makeRaw({ parent_id: null }))
    expect(result.parentTransactionId).toBeUndefined()
  })

  it('maps processedAt and createdAt', () => {
    const result = transformTransaction(makeRaw())
    expect(result.processedAt).toBe('2024-01-15T10:00:00.000Z')
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRaw()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies TransactionSchema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformTransaction', () => {
    const canonical = transformTransaction(makeRaw())
    const body = untransformTransaction(canonical)
    expect(body.kind).toBe('sale')
    expect(body.gateway).toBe('shopline_payments')
    // amount should be back in major units as string
    expect(body.amount).toBe('108.24')
    expect(body.currency).toBe('USD')
  })
})
