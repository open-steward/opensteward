import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  untransformTransaction,
  type RawSyliusPayment,
} from '../../../../../../../src/verticals/ecommerce/adapters/sylius/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makePayment(overrides: Partial<RawSyliusPayment> = {}): RawSyliusPayment {
  return {
    id: 401,
    order: { id: 500, number: '000000042' },
    state: 'completed',
    amount: 5993, // $59.93 in cents
    currencyCode: 'USD',
    method: { code: 'stripe', name: 'Stripe' },
    createdAt: '2024-02-20T14:30:00Z',
    updatedAt: '2024-02-20T14:31:00Z',
    ...overrides,
  }
}

describe('transformTransaction (Sylius)', () => {
  it('maps core fields', () => {
    const result = transformTransaction(makePayment())
    expect(result.id).toBe('401')
    expect(result.orderId).toBe('500')
    expect(result.amount).toEqual({ amount: 5993, currency: 'USD' })
    expect(result.gateway).toBe('Stripe')
  })

  it('converts amount from cents to decimal', () => {
    const result = transformTransaction(makePayment({ amount: 1000 }))
    expect(result.amount).toEqual({ amount: 1000, currency: 'USD' })
  })

  it('maps completed state to CAPTURE + SUCCESS', () => {
    const result = transformTransaction(makePayment({ state: 'completed' }))
    expect(result.kind).toBe('CAPTURE')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps new state to AUTHORIZATION + PENDING', () => {
    const result = transformTransaction(makePayment({ state: 'new' }))
    expect(result.kind).toBe('AUTHORIZATION')
    expect(result.status).toBe('PENDING')
  })

  it('maps processing state to AUTHORIZATION + PENDING', () => {
    const result = transformTransaction(makePayment({ state: 'processing' }))
    expect(result.kind).toBe('AUTHORIZATION')
    expect(result.status).toBe('PENDING')
  })

  it('maps cancelled state to VOID + SUCCESS', () => {
    const result = transformTransaction(makePayment({ state: 'cancelled' }))
    expect(result.kind).toBe('VOID')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps refunded state to REFUND + SUCCESS', () => {
    const result = transformTransaction(makePayment({ state: 'refunded' }))
    expect(result.kind).toBe('REFUND')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps failed state to SALE + FAILURE', () => {
    const result = transformTransaction(makePayment({ state: 'failed' }))
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('FAILURE')
  })

  it('extracts orderId from IRI string', () => {
    const result = transformTransaction(makePayment({ order: '/api/v2/admin/orders/42' }))
    expect(result.orderId).toBe('42')
  })

  it('extracts gateway from method object', () => {
    const result = transformTransaction(makePayment({ method: { code: 'paypal', name: 'PayPal' } }))
    expect(result.gateway).toBe('PayPal')
  })

  it('handles string method (IRI)', () => {
    const result = transformTransaction(makePayment({ method: '/api/v2/admin/payment-methods/stripe' }))
    expect(result.gateway).toBe('/api/v2/admin/payment-methods/stripe')
  })

  it('handles null method', () => {
    const result = transformTransaction(makePayment({ method: null }))
    expect(result.gateway).toBeUndefined()
  })

  it('defaults currency to USD', () => {
    const result = transformTransaction(makePayment({ currencyCode: undefined }))
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
    const body = untransformTransaction(canonical)
    expect(body['amount']).toBe(5993)
    expect(body['method']).toBe('Stripe')
  })
})
