import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawShoperTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/shoper/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeRaw(overrides: Partial<RawShoperTransaction> = {}): RawShoperTransaction {
  return {
    transaction_id: 501,
    order_id: 20001,
    gateway: 'payu',
    amount: '249.99',
    currency: 'PLN',
    status: 1,
    reference: 'PAY-REF-12345',
    add_date: '2024-02-14T10:05:00.000Z',
    edit_date: '2024-02-14T10:05:30.000Z',
    ...overrides,
  }
}

describe('shoper transformTransaction', () => {
  it('maps transaction_id to string id', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('501')
  })

  it('maps order_id to orderId string', () => {
    const result = transformTransaction(makeRaw())
    expect(result.orderId).toBe('20001')
  })

  it('kind is always SALE for Shoper transactions', () => {
    const result = transformTransaction(makeRaw())
    expect(result.kind).toBe('SALE')
  })

  it('maps numeric status 1 to SUCCESS', () => {
    const result = transformTransaction(makeRaw())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps numeric status 0 to PENDING', () => {
    const result = transformTransaction(makeRaw({ status: 0 }))
    expect(result.status).toBe('PENDING')
  })

  it('converts amount to minor units (PLN: ×100)', () => {
    // 249.99 PLN = 24999 gr
    const result = transformTransaction(makeRaw())
    expect(result.amount?.amount).toBe(24999)
    expect(result.amount?.currency).toBe('PLN')
  })

  it('maps gateway and reference as authorizationCode', () => {
    const result = transformTransaction(makeRaw())
    expect(result.gateway).toBe('payu')
    expect(result.authorizationCode).toBe('PAY-REF-12345')
  })

  it('falls back to payment_id as gateway when gateway is absent', () => {
    const result = transformTransaction(makeRaw({ gateway: null, payment_id: 42 }))
    expect(result.gateway).toBe('42')
  })

  it('produces output that passes TransactionSchema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
