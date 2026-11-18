import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawLsTransaction,
  type RawLsTransactionAttributes,
} from '../../../../../../../src/verticals/ecommerce/adapters/lemon-squeezy/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeAttrs(
  overrides: Partial<RawLsTransactionAttributes> = {},
): RawLsTransactionAttributes {
  return {
    store_id: 1,
    customer_id: 42,
    order_number: 1001,
    status: 'paid',
    currency: 'USD',
    total: 5399,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    refunded_at: null,
    ...overrides,
  }
}

function makeRaw(attrsOverrides: Partial<RawLsTransactionAttributes> = {}): RawLsTransaction {
  return {
    id: 'txn-66',
    type: 'orders',
    attributes: makeAttrs(attrsOverrides),
  }
}

describe('transformTransaction (lemon-squeezy)', () => {
  it('maps raw.id to id', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('txn-66')
  })

  it('uses raw.id as orderId', () => {
    // LS derives orderId from the order resource id, not a separate field
    const result = transformTransaction(makeRaw())
    expect(result.orderId).toBe('txn-66')
  })

  it('maps paid status to SALE kind', () => {
    const result = transformTransaction(makeRaw({ status: 'paid' }))
    expect(result.kind).toBe('SALE')
  })

  it('maps refunded status to REFUND kind', () => {
    const result = transformTransaction(makeRaw({ status: 'refunded' }))
    expect(result.kind).toBe('REFUND')
  })

  it('maps pending status to SALE kind (default)', () => {
    const result = transformTransaction(makeRaw({ status: 'pending' }))
    expect(result.kind).toBe('SALE')
  })

  it('maps paid status to SUCCESS', () => {
    const result = transformTransaction(makeRaw({ status: 'paid' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps refunded status to SUCCESS', () => {
    const result = transformTransaction(makeRaw({ status: 'refunded' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps pending status to PENDING', () => {
    const result = transformTransaction(makeRaw({ status: 'pending' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps total cents directly to amount.amount', () => {
    const result = transformTransaction(makeRaw({ total: 5399 }))
    expect(result.amount?.amount).toBe(5399)
    expect(result.amount?.currency).toBe('USD')
  })

  it('hardcodes gateway to lemon-squeezy', () => {
    const result = transformTransaction(makeRaw())
    expect(result.gateway).toBe('lemon-squeezy')
  })

  it('maps paid processedAt to created_at', () => {
    const result = transformTransaction(
      makeRaw({ status: 'paid', created_at: '2024-03-01T00:00:00Z' }),
    )
    expect(result.processedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('maps refunded processedAt to refunded_at', () => {
    const result = transformTransaction(
      makeRaw({ status: 'refunded', refunded_at: '2024-04-01T00:00:00Z' }),
    )
    expect(result.processedAt).toBe('2024-04-01T00:00:00Z')
  })

  it('falls back to updated_at for processedAt when refunded but refunded_at is null', () => {
    const result = transformTransaction(
      makeRaw({ status: 'refunded', refunded_at: null, updated_at: '2024-04-02T00:00:00Z' }),
    )
    expect(result.processedAt).toBe('2024-04-02T00:00:00Z')
  })

  it('maps created_at to createdAt', () => {
    const result = transformTransaction(makeRaw())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
  })

  it('stores status in metadata', () => {
    const result = transformTransaction(makeRaw())
    const meta = result.metadata as Record<string, unknown>
    expect(meta.status).toBe('paid')
  })

  it('produces a payload satisfying TransactionSchema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
