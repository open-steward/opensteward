import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawBigCommerceTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/bigcommerce/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeTransaction(overrides: Partial<RawBigCommerceTransaction> = {}): RawBigCommerceTransaction {
  return {
    id: 6001,
    order_id: 1001,
    event: 'purchase',
    status: 'ok',
    amount: 108.24,
    currency: 'USD',
    gateway: 'stripe',
    gateway_transaction_id: 'TXN_1234',
    date_created: '2024-05-01T10:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps event and status to canonical enums', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('6001')
    expect(typeof result.id).toBe('string')
    expect(result.orderId).toBe('1001')
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('SUCCESS')
    expect(result.gateway).toBe('stripe')
    expect(result.authorizationCode).toBe('TXN_1234')
    expect(result.amount).toEqual({ amount: 10824, currency: 'USD' })
  })

  it('maps authorization event', () => {
    const result = transformTransaction(makeTransaction({ event: 'authorization' }))
    expect(result.kind).toBe('AUTHORIZATION')
  })

  it('maps refund event', () => {
    const result = transformTransaction(makeTransaction({ event: 'refund' }))
    expect(result.kind).toBe('REFUND')
  })

  it('maps error status', () => {
    const result = transformTransaction(makeTransaction({ status: 'error' }))
    expect(result.status).toBe('ERROR')
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
})
