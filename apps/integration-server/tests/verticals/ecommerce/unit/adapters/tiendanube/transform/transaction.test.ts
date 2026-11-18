import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawTiendanubeTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/tiendanube/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeTransaction(
  overrides: Partial<RawTiendanubeTransaction> = {},
): RawTiendanubeTransaction {
  return {
    id: 'txn-001',
    payment_provider_id: 'mercadopago',
    status: 'paid',
    events: [{ id: 'evt-1', type: 'sale', happened_at: '2026-01-15T09:30:00.000Z' }],
    captured_amount: { value: '59.98', currency: 'USD' },
    info: { authorization_code: 'AUTH123' },
    created_at: '2026-01-15T09:30:00.000Z',
    ...overrides,
  }
}

describe('transformTransaction (Tiendanube)', () => {
  it('maps id and gateway from payment_provider_id', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('txn-001')
    expect(result.gateway).toBe('mercadopago')
  })

  it('maps status=paid to SUCCESS', () => {
    expect(transformTransaction(makeTransaction({ status: 'paid' })).status).toBe('SUCCESS')
    expect(transformTransaction(makeTransaction({ status: 'captured' })).status).toBe('SUCCESS')
    expect(transformTransaction(makeTransaction({ status: 'pending' })).status).toBe('PENDING')
    expect(transformTransaction(makeTransaction({ status: 'failed' })).status).toBe('FAILURE')
    expect(transformTransaction(makeTransaction({ status: 'voided' })).status).toBe('FAILURE')
  })

  it('derives kind from first event type', () => {
    expect(transformTransaction(makeTransaction()).kind).toBe('SALE')
    expect(
      transformTransaction(makeTransaction({ events: [{ type: 'authorization' }] })).kind,
    ).toBe('AUTHORIZATION')
    expect(transformTransaction(makeTransaction({ events: [{ type: 'refund' }] })).kind).toBe(
      'REFUND',
    )
  })

  it('resolves amount from captured_amount in minor units', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.amount).toEqual({ amount: 5998, currency: 'USD' })
  })

  it('falls back to authorized_amount when captured_amount is zero/missing', () => {
    const result = transformTransaction(
      makeTransaction({
        captured_amount: { value: '0', currency: 'USD' },
        authorized_amount: { value: '59.98', currency: 'USD' },
      }),
    )
    expect(result.amount).toEqual({ amount: 5998, currency: 'USD' })
  })

  it('maps authorizationCode from info', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.authorizationCode).toBe('AUTH123')
  })

  it('maps orderId when provided', () => {
    const result = transformTransaction(makeTransaction(), 'ord-1042')
    expect(result.orderId).toBe('ord-1042')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeTransaction()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying TransactionSchema', () => {
    const result = transformTransaction(makeTransaction(), 'ord-1042')
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
