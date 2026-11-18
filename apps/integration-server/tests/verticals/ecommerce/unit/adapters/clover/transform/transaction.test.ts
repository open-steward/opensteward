import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawCloverPayment,
} from '../../../../../../../src/verticals/ecommerce/adapters/clover/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makePayment(overrides: Partial<RawCloverPayment> = {}): RawCloverPayment {
  return {
    id: 'PAY_001',
    order: { id: 'ORD_001' },
    amount: 1500,
    result: 'SUCCESS',
    tender: { label: 'Credit Card' },
    cardTransaction: {
      authCode: 'AUTH123',
      type: 'AUTH',
    },
    createdTime: 1714557600000,
    modifiedTime: 1714564800000,
    ...overrides,
  }
}

describe('transformTransaction (Clover)', () => {
  it('maps core fields', () => {
    const result = transformTransaction(makePayment())
    expect(result.id).toBe('PAY_001')
    expect(result.orderId).toBe('ORD_001')
    expect(result.amount).toEqual({ amount: 1500, currency: 'USD' })
  })

  it('maps status', () => {
    const result = transformTransaction(makePayment())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps FAIL to FAILURE', () => {
    const result = transformTransaction(makePayment({ result: 'FAIL' }))
    expect(result.status).toBe('FAILURE')
  })

  it('maps kind from card transaction type', () => {
    const result = transformTransaction(makePayment())
    expect(result.kind).toBe('AUTHORIZATION')
  })

  it('defaults kind to SALE', () => {
    const result = transformTransaction(makePayment({ cardTransaction: undefined }))
    expect(result.kind).toBe('SALE')
  })

  it('maps gateway from tender label', () => {
    const result = transformTransaction(makePayment())
    expect(result.gateway).toBe('clover_credit_card')
  })

  it('maps authorization code', () => {
    const result = transformTransaction(makePayment())
    expect(result.authorizationCode).toBe('AUTH123')
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

  it('handles missing amount', () => {
    const result = transformTransaction(makePayment({ amount: undefined }))
    expect(result.amount).toBeUndefined()
  })
})
