import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  untransformTransaction,
  type RawShopifyTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/loja-integrada/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeRaw(overrides: Partial<RawShopifyTransaction> = {}): RawShopifyTransaction {
  return {
    id: 9001,
    order_id: 5001,
    kind: 'sale',
    status: 'success',
    amount: '199.90',
    currency: 'BRL',
    gateway: 'pagseguro',
    authorization: 'AUTH-BR-2024-001',
    parent_id: null,
    error_code: null,
    message: null,
    processed_at: '2024-03-01T10:05:00Z',
    created_at: '2024-03-01T10:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction (loja-integrada / Shopify)', () => {
  it('maps id and orderId', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('9001')
    expect(result.orderId).toBe('5001')
  })

  it('maps kind to canonical enum', () => {
    expect(transformTransaction(makeRaw({ kind: 'sale' })).kind).toBe('SALE')
    expect(transformTransaction(makeRaw({ kind: 'authorization' })).kind).toBe('AUTHORIZATION')
    expect(transformTransaction(makeRaw({ kind: 'capture' })).kind).toBe('CAPTURE')
    expect(transformTransaction(makeRaw({ kind: 'refund' })).kind).toBe('REFUND')
    expect(transformTransaction(makeRaw({ kind: 'void' })).kind).toBe('VOID')
  })

  it('maps status to canonical enum', () => {
    expect(transformTransaction(makeRaw({ status: 'success' })).status).toBe('SUCCESS')
    expect(transformTransaction(makeRaw({ status: 'pending' })).status).toBe('PENDING')
    expect(transformTransaction(makeRaw({ status: 'failure' })).status).toBe('FAILURE')
    expect(transformTransaction(makeRaw({ status: 'error' })).status).toBe('ERROR')
  })

  it('converts amount from major to minor units', () => {
    const result = transformTransaction(makeRaw())
    // 199.90 BRL → 19990 cents
    expect(result.amount).toEqual({ amount: 19990, currency: 'BRL' })
  })

  it('uses USD as default currency when currency is absent', () => {
    const result = transformTransaction(makeRaw({ currency: undefined, amount: '50.00' }))
    expect(result.amount?.currency).toBe('USD')
  })

  it('maps gateway and authorizationCode', () => {
    const result = transformTransaction(makeRaw())
    expect(result.gateway).toBe('pagseguro')
    expect(result.authorizationCode).toBe('AUTH-BR-2024-001')
  })

  it('maps parentTransactionId when parent_id is set', () => {
    const result = transformTransaction(makeRaw({ parent_id: 9000 }))
    expect(result.parentTransactionId).toBe('9000')
  })

  it('returns undefined parentTransactionId when parent_id is null', () => {
    const result = transformTransaction(makeRaw({ parent_id: null }))
    expect(result.parentTransactionId).toBeUndefined()
  })

  it('returns undefined errorCode and errorMessage when null', () => {
    const result = transformTransaction(makeRaw({ error_code: null, message: null }))
    expect(result.errorCode).toBeUndefined()
    expect(result.errorMessage).toBeUndefined()
  })

  it('maps error fields when present', () => {
    const result = transformTransaction(
      makeRaw({ error_code: 'INSUFFICIENT_FUNDS', message: 'Card declined.' }),
    )
    expect(result.errorCode).toBe('INSUFFICIENT_FUNDS')
    expect(result.errorMessage).toBe('Card declined.')
  })

  it('maps processedAt and createdAt', () => {
    const result = transformTransaction(makeRaw())
    expect(result.processedAt).toBe('2024-03-01T10:05:00Z')
    expect(result.createdAt).toBe('2024-03-01T10:00:00Z')
  })

  it('returns undefined kind for unknown kind strings', () => {
    const result = transformTransaction(makeRaw({ kind: 'unknown_kind' }))
    expect(result.kind).toBeUndefined()
  })

  it('preserves raw in metadata', () => {
    const raw = makeRaw()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})

describe('untransformTransaction (loja-integrada / Shopify)', () => {
  it('maps canonical fields back to Shopify body keys with lowercased kind', () => {
    const result = untransformTransaction({
      kind: 'SALE',
      amount: { amount: 19990, currency: 'BRL' },
      gateway: 'pagseguro',
      parentTransactionId: '9000',
    })
    expect(result.kind).toBe('sale')
    expect(result.amount).toBe(19990)
    expect(result.currency).toBe('BRL')
    expect(result.gateway).toBe('pagseguro')
    expect(result.parent_id).toBe('9000')
  })
})
