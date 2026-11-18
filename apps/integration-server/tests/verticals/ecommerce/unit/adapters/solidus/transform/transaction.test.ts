import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  untransformTransaction,
  type RawSolidusPayment,
} from '../../../../../../../src/verticals/ecommerce/adapters/solidus/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makePayment(overrides: Partial<RawSolidusPayment> = {}): RawSolidusPayment {
  return {
    id: 401,
    order_id: 500,
    state: 'completed',
    amount: '134.93',
    currency: 'USD',
    payment_method_name: 'Braintree',
    payment_method_id: 1,
    source_type: 'Solidus::CreditCard',
    response_code: 'txn_9876543210',
    number: 'P67890',
    created_at: '2024-02-20T14:30:00.000Z',
    updated_at: '2024-02-20T14:31:00.000Z',
    ...overrides,
  }
}

describe('transformTransaction (Solidus)', () => {
  it('maps core fields', () => {
    const result = transformTransaction(makePayment())
    expect(result.id).toBe('401')
    expect(result.orderId).toBe('500')
    expect(result.amount).toEqual({ amount: 13493, currency: 'USD' })
    expect(result.gateway).toBe('Braintree')
    expect(result.authorizationCode).toBe('txn_9876543210')
  })

  it('maps completed state to CAPTURE + SUCCESS', () => {
    const result = transformTransaction(makePayment({ state: 'completed' }))
    expect(result.kind).toBe('CAPTURE')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps pending state to AUTHORIZATION + PENDING', () => {
    const result = transformTransaction(makePayment({ state: 'pending' }))
    expect(result.kind).toBe('AUTHORIZATION')
    expect(result.status).toBe('PENDING')
  })

  it('maps checkout state to AUTHORIZATION + PENDING', () => {
    const result = transformTransaction(makePayment({ state: 'checkout' }))
    expect(result.kind).toBe('AUTHORIZATION')
    expect(result.status).toBe('PENDING')
  })

  it('maps processing state to SALE + PENDING (Solidus-specific)', () => {
    const result = transformTransaction(makePayment({ state: 'processing' }))
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('PENDING')
  })

  it('maps void state to VOID + SUCCESS', () => {
    const result = transformTransaction(makePayment({ state: 'void' }))
    expect(result.kind).toBe('VOID')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps failed state to SALE + FAILURE', () => {
    const result = transformTransaction(makePayment({ state: 'failed' }))
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('FAILURE')
  })

  it('maps invalid state to SALE + FAILURE', () => {
    const result = transformTransaction(makePayment({ state: 'invalid' }))
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('FAILURE')
  })

  it('handles missing response_code', () => {
    const result = transformTransaction(makePayment({ response_code: null }))
    expect(result.authorizationCode).toBeUndefined()
  })

  it('defaults currency to USD', () => {
    const result = transformTransaction(makePayment({ currency: undefined }))
    expect(result.amount?.currency).toBe('USD')
  })

  it('preserves metadata', () => {
    const raw = makePayment()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies TransactionSchema', () => {
    const result = transformTransaction(makePayment())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformTransaction', () => {
    const canonical = transformTransaction(makePayment())
    const body = untransformTransaction(canonical) as { payment: Record<string, unknown> }
    expect(body.payment['amount']).toBe(13493)
  })
})
