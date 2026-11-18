import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  untransformTransaction,
  type RawSapoTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/sapo/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeTransaction(overrides: Partial<RawSapoTransaction> = {}): RawSapoTransaction {
  return {
    id: 8001,
    order_id: 1001,
    kind: 'sale',
    status: 'success',
    amount: '430000',
    currency: 'VND',
    gateway: 'momo',
    authorization: 'AUTH-2024-001',
    parent_id: null,
    error_code: null,
    message: null,
    processed_on: '2024-04-01T07:10:00Z',
    created_on: '2024-04-01T07:05:00Z',
    ...overrides,
  }
}

describe('transformTransaction (Sapo)', () => {
  it('stringifies id and order_id', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('8001')
    expect(result.orderId).toBe('1001')
  })

  it('maps kind string to canonical enum', () => {
    expect(transformTransaction(makeTransaction({ kind: 'sale' })).kind).toBe('SALE')
    expect(transformTransaction(makeTransaction({ kind: 'authorization' })).kind).toBe(
      'AUTHORIZATION',
    )
    expect(transformTransaction(makeTransaction({ kind: 'capture' })).kind).toBe('CAPTURE')
    expect(transformTransaction(makeTransaction({ kind: 'refund' })).kind).toBe('REFUND')
    expect(transformTransaction(makeTransaction({ kind: 'void' })).kind).toBe('VOID')
  })

  it('maps status string to canonical enum', () => {
    expect(transformTransaction(makeTransaction({ status: 'success' })).status).toBe('SUCCESS')
    expect(transformTransaction(makeTransaction({ status: 'failure' })).status).toBe('FAILURE')
    expect(transformTransaction(makeTransaction({ status: 'pending' })).status).toBe('PENDING')
    expect(transformTransaction(makeTransaction({ status: 'error' })).status).toBe('ERROR')
  })

  it('converts VND amount to minor units (no scaling)', () => {
    // VND has 0 exponent: majorToMinor(430000, 'VND') === 430000
    const result = transformTransaction(makeTransaction())
    expect(result.amount).toEqual({ amount: 430000, currency: 'VND' })
  })

  it('defaults currency to VND when not provided', () => {
    const result = transformTransaction(makeTransaction({ currency: undefined, amount: '1000' }))
    expect(result.amount?.currency).toBe('VND')
  })

  it('maps gateway and authorization fields', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.gateway).toBe('momo')
    expect(result.authorizationCode).toBe('AUTH-2024-001')
  })

  it('maps processed_on → processedAt and created_on → createdAt', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.processedAt).toBe('2024-04-01T07:10:00Z')
    expect(result.createdAt).toBe('2024-04-01T07:05:00Z')
  })

  it('maps parent_id when present', () => {
    const result = transformTransaction(makeTransaction({ parent_id: 9001 }))
    expect(result.parentTransactionId).toBe('9001')
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
    const raw = untransformTransaction(canonical)
    expect(raw.kind).toBe('sale')
    expect(raw.gateway).toBe('momo')
  })
})
