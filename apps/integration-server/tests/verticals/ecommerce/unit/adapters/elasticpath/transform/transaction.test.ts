import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawEpTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/elasticpath/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeTx(overrides: Partial<RawEpTransaction> = {}): RawEpTransaction {
  return {
    id: 'tx-001',
    type: 'transaction',
    reference: 'ref-abc-123',
    gateway: 'stripe',
    amount: 5999,
    currency: 'USD',
    transaction_type: 'purchase',
    status: 'complete',
    relationships: {
      order: { data: { type: 'order', id: 'ord-001' } },
    },
    timestamps: {
      created_at: '2024-08-01T10:00:00.000Z',
    },
    ...overrides,
  }
}

describe('transformTransaction (Elastic Path)', () => {
  it('maps core fields', () => {
    const result = transformTransaction(makeTx(), 'ord-001')
    expect(result.id).toBe('tx-001')
    expect(result.orderId).toBe('ord-001')
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('SUCCESS')
    expect(result.gateway).toBe('stripe')
    expect(result.authorizationCode).toBe('ref-abc-123')
    expect(result.createdAt).toBe('2024-08-01T10:00:00.000Z')
  })

  it('passes through integer minor units for amount', () => {
    const result = transformTransaction(makeTx())
    expect(result.amount).toEqual({ amount: 5999, currency: 'USD' })
  })

  it('maps authorize transaction type', () => {
    const result = transformTransaction(makeTx({ transaction_type: 'authorize' }))
    expect(result.kind).toBe('AUTHORIZATION')
  })

  it('maps capture transaction type', () => {
    const result = transformTransaction(makeTx({ transaction_type: 'capture' }))
    expect(result.kind).toBe('CAPTURE')
  })

  it('maps refund transaction type', () => {
    const result = transformTransaction(makeTx({ transaction_type: 'refund' }))
    expect(result.kind).toBe('REFUND')
  })

  it('maps pending status', () => {
    const result = transformTransaction(makeTx({ status: 'pending' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps failed status', () => {
    const result = transformTransaction(makeTx({ status: 'failed' }))
    expect(result.status).toBe('FAILURE')
  })

  it('falls back to relationship orderId when not provided', () => {
    const result = transformTransaction(makeTx())
    expect(result.orderId).toBe('ord-001')
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeTx()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const result = transformTransaction(makeTx(), 'ord-001')
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
