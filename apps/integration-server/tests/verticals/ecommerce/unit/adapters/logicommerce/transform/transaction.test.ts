import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  untransformTransaction,
  type RawShopifyTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/logicommerce/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeTransaction(overrides: Partial<RawShopifyTransaction> = {}): RawShopifyTransaction {
  return {
    id: 7001,
    order_id: 4001,
    kind: 'sale',
    status: 'success',
    amount: '53.99',
    currency: 'EUR',
    gateway: 'redsys',
    processed_at: '2024-03-01T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction (logicommerce / Shopify)', () => {
  it('maps id to string', () => {
    const result = transformTransaction(makeTransaction({ id: 42 }))
    expect(result.id).toBe('42')
  })

  it('maps order_id to orderId', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.orderId).toBe('4001')
  })

  it('maps sale kind to SALE', () => {
    const result = transformTransaction(makeTransaction({ kind: 'sale' }))
    expect(result.kind).toBe('SALE')
  })

  it('maps refund kind to REFUND', () => {
    const result = transformTransaction(makeTransaction({ kind: 'refund' }))
    expect(result.kind).toBe('REFUND')
  })

  it('maps success status to SUCCESS', () => {
    const result = transformTransaction(makeTransaction({ status: 'success' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('converts EUR amount major units to minor units', () => {
    // 53.99 EUR → 5399 cents
    const result = transformTransaction(makeTransaction())
    expect(result.amount?.amount).toBe(5399)
    expect(result.amount?.currency).toBe('EUR')
  })

  it('maps gateway', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.gateway).toBe('redsys')
  })

  it('stores raw payload in metadata', () => {
    const raw = makeTransaction()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying TransactionSchema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})

describe('untransformTransaction (logicommerce / Shopify)', () => {
  it('maps kind to lowercase', () => {
    const body = untransformTransaction({ kind: 'SALE' })
    expect(body.kind).toBe('sale')
  })

  it('round-trips gateway and kind', () => {
    const canonical = transformTransaction(makeTransaction())
    const body = untransformTransaction(canonical)
    expect(body.gateway).toBe('redsys')
    expect(body.kind).toBe('sale')
  })
})
