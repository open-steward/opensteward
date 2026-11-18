import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  untransformTransaction,
  type RawShopifyTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/godaddy-websites-commerce/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeTransaction(overrides: Partial<RawShopifyTransaction> = {}): RawShopifyTransaction {
  return {
    id: 6001,
    order_id: 1001,
    kind: 'sale',
    status: 'success',
    amount: '49.99',
    currency: 'USD',
    gateway: 'stripe',
    authorization: 'auth_xyz',
    processed_at: '2024-03-01T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction (GoDaddy Websites + Commerce / Shopify shapes)', () => {
  it('maps core fields and stringifies ids', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('6001')
    expect(result.orderId).toBe('1001')
    expect(result.gateway).toBe('stripe')
    expect(result.authorizationCode).toBe('auth_xyz')
  })

  it('maps kind and status enums', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps all status values', () => {
    expect(transformTransaction(makeTransaction({ status: 'pending' })).status).toBe('PENDING')
    expect(transformTransaction(makeTransaction({ status: 'failure' })).status).toBe('FAILURE')
    expect(transformTransaction(makeTransaction({ status: 'error' })).status).toBe('ERROR')
  })

  it('converts amount from major to minor units', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.amount).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('returns undefined amount when absent', () => {
    const result = transformTransaction(makeTransaction({ amount: undefined }))
    expect(result.amount).toBeUndefined()
  })

  it('maps parentTransactionId from parent_id', () => {
    const result = transformTransaction(makeTransaction({ parent_id: 5555 }))
    expect(result.parentTransactionId).toBe('5555')
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

  it('round-trips via untransformTransaction', () => {
    const canonical = transformTransaction(makeTransaction())
    const back = untransformTransaction(canonical)
    expect(back.kind).toBe('sale')
    expect(back.gateway).toBe('stripe')
  })
})
