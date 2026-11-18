import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawIzbergTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/izberg/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeTransaction(overrides: Partial<RawIzbergTransaction> = {}): RawIzbergTransaction {
  return {
    id: 42,
    resource_uri: '/v1/transaction/42/',
    order: 5001,
    amount: '149.99',
    currency: 'EUR',
    transaction_type: 1, // SALE
    status: 'completed',
    date_created: '2024-03-01T00:00:00Z',
    date_modified: '2024-03-01T01:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction (izberg)', () => {
  it('maps id as string', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('42')
  })

  it('maps orderId from order', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.orderId).toBe('5001')
  })

  it('maps orderId as undefined when order is null', () => {
    const result = transformTransaction(makeTransaction({ order: null }))
    expect(result.orderId).toBeUndefined()
  })

  it('maps transaction_type 1 → SALE kind', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.kind).toBe('SALE')
  })

  it('maps transaction_type 2 → REFUND kind', () => {
    const result = transformTransaction(makeTransaction({ transaction_type: 2, amount: '-29.99' }))
    expect(result.kind).toBe('REFUND')
  })

  it('maps completed → SUCCESS status', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps all izberg statuses to canonical', () => {
    const cases: [string, string][] = [
      ['complete', 'SUCCESS'],
      ['completed', 'SUCCESS'],
      ['success', 'SUCCESS'],
      ['pending', 'PENDING'],
      ['failed', 'FAILURE'],
      ['failure', 'FAILURE'],
      ['error', 'ERROR'],
    ]
    for (const [raw, expected] of cases) {
      const result = transformTransaction(makeTransaction({ status: raw }))
      expect(result.status).toBe(expected)
    }
  })

  it('maps amount in minor units (EUR)', () => {
    const result = transformTransaction(makeTransaction())
    // 149.99 EUR → 14999 minor units
    expect(result.amount).toEqual({ amount: 14999, currency: 'EUR' })
  })

  it('takes absolute value for negative refund amounts', () => {
    const result = transformTransaction(makeTransaction({ transaction_type: 2, amount: '-29.99' }))
    // |-29.99| EUR → 2999 minor units
    expect(result.amount).toEqual({ amount: 2999, currency: 'EUR' })
  })

  it('omits amount when raw.amount is null', () => {
    const result = transformTransaction(makeTransaction({ amount: null }))
    expect(result.amount).toBeUndefined()
  })

  it('maps processedAt and createdAt both from date_created', () => {
    // toIsoDatetime normalises to full ISO 8601 with milliseconds via Date.toISOString()
    const result = transformTransaction(makeTransaction())
    expect(result.processedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('defaults currency to EUR when not set', () => {
    const result = transformTransaction(makeTransaction({ currency: null }))
    expect(result.amount?.currency).toBe('EUR')
  })

  it('returns undefined kind for unknown transaction_type', () => {
    const result = transformTransaction(makeTransaction({ transaction_type: 99 }))
    expect(result.kind).toBeUndefined()
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeTransaction()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
