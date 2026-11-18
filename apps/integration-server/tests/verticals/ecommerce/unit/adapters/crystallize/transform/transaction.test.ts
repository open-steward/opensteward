import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  untransformTransaction,
  type RawCrystallizePayment,
} from '../../../../../../../src/verticals/ecommerce/adapters/crystallize/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makePayment(overrides: Partial<RawCrystallizePayment> = {}): RawCrystallizePayment {
  return {
    id: 'pi_123',
    orderId: 'order-001',
    provider: 'stripe',
    providerId: 'pi_123',
    amount: 49.98,
    currency: 'USD',
    method: null,
    status: 'success',
    createdAt: '2024-05-01T10:05:00.000Z',
    ...overrides,
  }
}

describe('transformTransaction (Crystallize)', () => {
  it('maps core fields', () => {
    const result = transformTransaction(makePayment())
    expect(result.id).toBe('pi_123')
    expect(result.orderId).toBe('order-001')
    expect(result.gateway).toBe('stripe')
    expect(result.amount).toEqual({ amount: 4998, currency: 'USD' })
  })

  it('defaults kind to CAPTURE', () => {
    const result = transformTransaction(makePayment())
    expect(result.kind).toBe('CAPTURE')
  })

  it('maps method to kind', () => {
    expect(transformTransaction(makePayment({ method: 'authorization' })).kind).toBe('AUTHORIZATION')
    expect(transformTransaction(makePayment({ method: 'refund' })).kind).toBe('REFUND')
    expect(transformTransaction(makePayment({ method: 'void' })).kind).toBe('VOID')
  })

  it('maps status', () => {
    expect(transformTransaction(makePayment({ status: 'success' })).status).toBe('SUCCESS')
    expect(transformTransaction(makePayment({ status: 'pending' })).status).toBe('PENDING')
    expect(transformTransaction(makePayment({ status: 'failed' })).status).toBe('FAILURE')
    expect(transformTransaction(makePayment({ status: 'error' })).status).toBe('ERROR')
  })

  it('handles null amount', () => {
    const result = transformTransaction(makePayment({ amount: null }))
    expect(result.amount).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makePayment()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const result = transformTransaction(makePayment())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformTransaction', () => {
    const canonical = transformTransaction(makePayment())
    const raw = untransformTransaction(canonical)
    expect(raw['provider']).toBe('stripe')
    expect(raw['amount']).toBe(4998)
    expect(raw['currency']).toBe('USD')
  })
})
