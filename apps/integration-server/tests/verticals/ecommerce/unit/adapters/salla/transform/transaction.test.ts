import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawSallaTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/salla/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeTransaction(overrides: Partial<RawSallaTransaction> = {}): RawSallaTransaction {
  return {
    id: 1001,
    order_id: 8001,
    type: 'sale',
    status: 'success',
    amount: { amount: 125.0, currency: 'SAR' },
    gateway: 'mada',
    authorization: 'AUTH-ABCDEF',
    created_at: '2024-05-01T10:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id and orderId', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('1001')
    expect(result.orderId).toBe('8001')
  })

  it('maps kind from type field: sale → SALE', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.kind).toBe('SALE')
  })

  it('maps kind: refund → REFUND', () => {
    const result = transformTransaction(makeTransaction({ type: 'refund' }))
    expect(result.kind).toBe('REFUND')
  })

  it('maps kind: capture → CAPTURE', () => {
    const result = transformTransaction(makeTransaction({ type: 'capture' }))
    expect(result.kind).toBe('CAPTURE')
  })

  it('maps status: success → SUCCESS', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps status: failed → FAILURE', () => {
    const result = transformTransaction(makeTransaction({ status: 'failed' }))
    expect(result.status).toBe('FAILURE')
  })

  it('converts amount to minor units', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.amount).toEqual({ amount: 12500, currency: 'SAR' })
  })

  it('maps gateway and authorizationCode', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.gateway).toBe('mada')
    expect(result.authorizationCode).toBe('AUTH-ABCDEF')
  })

  it('maps error fields', () => {
    const result = transformTransaction(
      makeTransaction({
        error_code: 'INSUFFICIENT_FUNDS',
        error_message: 'Not enough balance',
        status: 'failed',
      }),
    )
    expect(result.errorCode).toBe('INSUFFICIENT_FUNDS')
    expect(result.errorMessage).toBe('Not enough balance')
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
