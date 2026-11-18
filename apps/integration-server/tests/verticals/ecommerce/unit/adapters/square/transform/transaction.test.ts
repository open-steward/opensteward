import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawSquarePayment,
} from '../../../../../../../src/verticals/ecommerce/adapters/square/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makePayment(overrides: Partial<RawSquarePayment> = {}): RawSquarePayment {
  return {
    id: 'PAY_001',
    order_id: 'ORDER_001',
    amount_money: { amount: 1500, currency: 'USD' },
    status: 'COMPLETED',
    source_type: 'CARD',
    card_details: {
      auth_result_code: 'AUTH_XYZ',
      card: { card_brand: 'VISA' },
    },
    created_at: '2024-05-01T10:00:05Z',
    updated_at: '2024-05-01T10:00:10Z',
    ...overrides,
  }
}

describe('transformTransaction (Square)', () => {
  it('maps core fields with money conversion', () => {
    const result = transformTransaction(makePayment())
    expect(result.id).toBe('PAY_001')
    expect(result.orderId).toBe('ORDER_001')
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('SUCCESS')
    expect(result.amount).toEqual({ amount: 1500, currency: 'USD' })
    expect(result.gateway).toBe('square_card')
    expect(result.authorizationCode).toBe('AUTH_XYZ')
  })

  it('maps APPROVED status to AUTHORIZATION kind', () => {
    const result = transformTransaction(makePayment({ status: 'APPROVED' }))
    expect(result.kind).toBe('AUTHORIZATION')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps PENDING status', () => {
    const result = transformTransaction(makePayment({ status: 'PENDING' }))
    expect(result.status).toBe('PENDING')
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
})
