import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  untransformTransaction,
  type RawFabricTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/fabric/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeTransaction(overrides: Partial<RawFabricTransaction> = {}): RawFabricTransaction {
  return {
    id: 'tx-001',
    order_id: 'ord-001',
    kind: 'sale',
    status: 'success',
    amount: 93.18,
    currency: 'USD',
    gateway: 'stripe',
    authorization_code: 'AUTH-12345',
    parent_transaction_id: undefined,
    error_code: undefined,
    error_message: undefined,
    processed_at: '2024-07-01T10:01:00Z',
    created_at: '2024-07-01T10:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction (fabric)', () => {
  it('maps core fields', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('tx-001')
    expect(result.orderId).toBe('ord-001')
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('SUCCESS')
    expect(result.amount).toEqual({ amount: 9318, currency: 'USD' })
    expect(result.gateway).toBe('stripe')
    expect(result.authorizationCode).toBe('AUTH-12345')
  })

  it('maps kind values', () => {
    expect(transformTransaction(makeTransaction({ kind: 'authorization' })).kind).toBe('AUTHORIZATION')
    expect(transformTransaction(makeTransaction({ kind: 'capture' })).kind).toBe('CAPTURE')
    expect(transformTransaction(makeTransaction({ kind: 'sale' })).kind).toBe('SALE')
    expect(transformTransaction(makeTransaction({ kind: 'refund' })).kind).toBe('REFUND')
    expect(transformTransaction(makeTransaction({ kind: 'void' })).kind).toBe('VOID')
  })

  it('maps status values', () => {
    expect(transformTransaction(makeTransaction({ status: 'pending' })).status).toBe('PENDING')
    expect(transformTransaction(makeTransaction({ status: 'success' })).status).toBe('SUCCESS')
    expect(transformTransaction(makeTransaction({ status: 'failure' })).status).toBe('FAILURE')
    expect(transformTransaction(makeTransaction({ status: 'error' })).status).toBe('ERROR')
  })

  it('handles missing amount', () => {
    const result = transformTransaction(makeTransaction({ amount: undefined }))
    expect(result.amount).toBeUndefined()
  })

  it('maps error fields', () => {
    const result = transformTransaction(makeTransaction({
      error_code: 'DECLINED',
      error_message: 'Card declined',
    }))
    expect(result.errorCode).toBe('DECLINED')
    expect(result.errorMessage).toBe('Card declined')
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeTransaction()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})

describe('untransformTransaction (fabric)', () => {
  it('round-trips writable fields', () => {
    const body = untransformTransaction({
      kind: 'CAPTURE',
      amount: { amount: 5000, currency: 'EUR' },
      gateway: 'adyen',
    }) as Record<string, unknown>
    expect(body['kind']).toBe('capture')
    expect(body['amount']).toBe(50.00)
    expect(body['currency']).toBe('EUR')
    expect(body['gateway']).toBe('adyen')
  })
})
