import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  untransformTransaction,
  type RawShoplazzaTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/shoplazza/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeRaw(overrides: Partial<RawShoplazzaTransaction> = {}): RawShoplazzaTransaction {
  return {
    id: 90001,
    order_id: 70001,
    kind: 'sale',
    status: 'success',
    amount: '91.17',
    currency: 'USD',
    gateway: 'alipay',
    authorization: 'ALIPAY-AUTH-001',
    processed_at: '2024-04-15T09:05:00.000Z',
    created_at: '2024-04-15T09:05:00.000Z',
    ...overrides,
  }
}

describe('shoplazza transformTransaction', () => {
  it('maps id and orderId to strings', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('90001')
    expect(result.orderId).toBe('70001')
  })

  it('maps kind via KIND_MAP (sale → SALE)', () => {
    const result = transformTransaction(makeRaw())
    expect(result.kind).toBe('SALE')
  })

  it('maps status via STATUS_MAP (success → SUCCESS)', () => {
    const result = transformTransaction(makeRaw())
    expect(result.status).toBe('SUCCESS')
  })

  it('converts amount to minor units (USD: ×100)', () => {
    // 91.17 USD = 9117 cents
    const result = transformTransaction(makeRaw())
    expect(result.amount?.amount).toBe(9117)
    expect(result.amount?.currency).toBe('USD')
  })

  it('maps gateway and authorization as authorizationCode', () => {
    const result = transformTransaction(makeRaw())
    expect(result.gateway).toBe('alipay')
    expect(result.authorizationCode).toBe('ALIPAY-AUTH-001')
  })

  it('maps parent_id to parentTransactionId', () => {
    const result = transformTransaction(makeRaw({ parent_id: 99999 }))
    expect(result.parentTransactionId).toBe('99999')
  })

  it('produces output that passes TransactionSchema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformTransaction (amount serialized with .toFixed(2))', () => {
    const canonical = transformTransaction(makeRaw())
    const back = untransformTransaction(canonical)
    expect(back.kind).toBe('sale')
    expect(back.gateway).toBe('alipay')
    // Shoplazza untransform uses minorToMajor(...).toFixed(2)
    expect(back.amount).toBe('91.17')
  })
})
