import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawYokartTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/yokart/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeTransaction(overrides: Partial<RawYokartTransaction> = {}): RawYokartTransaction {
  return {
    transaction_id: 300,
    order_id: 1042,
    transaction_code: 'AUTH_XYZ',
    payment_method: 'stripe',
    transaction_status: '1',
    transaction_type: '1',
    transaction_amount: '49.99',
    transaction_currency: 'USD',
    transaction_date: '2024-05-01T11:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps core fields', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('300')
    expect(result.orderId).toBe('1042')
    expect(result.gateway).toBe('stripe')
    expect(result.authorizationCode).toBe('AUTH_XYZ')
  })

  it('converts amount from major to minor units', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.amount).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('uses orderId parameter when raw.order_id is absent', () => {
    const result = transformTransaction(makeTransaction({ order_id: undefined }), 'ord-ext')
    expect(result.orderId).toBe('ord-ext')
  })

  it('maps status "1" to SUCCESS', () => {
    expect(transformTransaction(makeTransaction({ transaction_status: '1' })).status).toBe(
      'SUCCESS',
    )
    expect(transformTransaction(makeTransaction({ transaction_status: 'success' })).status).toBe(
      'SUCCESS',
    )
  })

  it('maps status "2" to FAILURE', () => {
    expect(transformTransaction(makeTransaction({ transaction_status: '2' })).status).toBe(
      'FAILURE',
    )
    expect(transformTransaction(makeTransaction({ transaction_status: 'failed' })).status).toBe(
      'FAILURE',
    )
  })

  it('maps status "3" to PENDING', () => {
    expect(transformTransaction(makeTransaction({ transaction_status: '3' })).status).toBe(
      'PENDING',
    )
    expect(transformTransaction(makeTransaction({ transaction_status: 'pending' })).status).toBe(
      'PENDING',
    )
  })

  it('maps status "4" (void) to FAILURE', () => {
    expect(transformTransaction(makeTransaction({ transaction_status: '4' })).status).toBe(
      'FAILURE',
    )
    expect(transformTransaction(makeTransaction({ transaction_status: 'void' })).status).toBe(
      'FAILURE',
    )
  })

  it('maps type "1" to SALE', () => {
    expect(transformTransaction(makeTransaction({ transaction_type: '1' })).kind).toBe('SALE')
    expect(transformTransaction(makeTransaction({ transaction_type: 'sale' })).kind).toBe('SALE')
  })

  it('maps type "2" to REFUND', () => {
    expect(transformTransaction(makeTransaction({ transaction_type: '2' })).kind).toBe('REFUND')
    expect(transformTransaction(makeTransaction({ transaction_type: 'refund' })).kind).toBe(
      'REFUND',
    )
  })

  it('maps type "3" to AUTHORIZATION', () => {
    expect(transformTransaction(makeTransaction({ transaction_type: '3' })).kind).toBe(
      'AUTHORIZATION',
    )
    expect(transformTransaction(makeTransaction({ transaction_type: 'auth' })).kind).toBe(
      'AUTHORIZATION',
    )
  })

  it('maps type "4" to CAPTURE', () => {
    expect(transformTransaction(makeTransaction({ transaction_type: '4' })).kind).toBe('CAPTURE')
    expect(transformTransaction(makeTransaction({ transaction_type: 'capture' })).kind).toBe(
      'CAPTURE',
    )
  })

  it('defaults currency to USD when transaction_currency is absent', () => {
    const result = transformTransaction(makeTransaction({ transaction_currency: undefined }))
    expect(result.amount?.currency).toBe('USD')
  })

  it('handles null transaction_amount (no amount field)', () => {
    const result = transformTransaction(makeTransaction({ transaction_amount: null }))
    expect(result.amount).toBeUndefined()
  })

  it('maps transaction_date to processedAt and createdAt', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.processedAt).toBeTruthy()
    expect(result.createdAt).toBeTruthy()
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
