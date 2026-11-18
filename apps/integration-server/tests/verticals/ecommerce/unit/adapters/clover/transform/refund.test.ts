import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawCloverRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/clover/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawCloverRefund> = {}): RawCloverRefund {
  return {
    id: 'REF_001',
    orderRef: { id: 'ORD_001' },
    payment: { id: 'PAY_001' },
    amount: 500,
    createdTime: 1714557600000,
    ...overrides,
  }
}

describe('transformRefund (Clover)', () => {
  it('maps core fields', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('REF_001')
    expect(result.orderId).toBe('ORD_001')
    expect(result.amount).toEqual({ amount: 500, currency: 'USD' })
  })

  it('maps payment as transaction id', () => {
    const result = transformRefund(makeRefund())
    expect(result.transactionIds).toEqual(['PAY_001'])
  })

  it('maps timestamp', () => {
    const result = transformRefund(makeRefund())
    expect(result.createdAt).toBeDefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRefund()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const result = transformRefund(makeRefund())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('handles missing amount', () => {
    const result = transformRefund(makeRefund({ amount: undefined }))
    expect(result.amount).toBeUndefined()
  })
})

describe('untransformRefund (Clover)', () => {
  it('converts amount back to cents', () => {
    const raw = untransformRefund({ amount: { amount: 500, currency: 'USD' } })
    expect(raw['amount']).toBe(500)
  })

  it('passes through reason', () => {
    const raw = untransformRefund({ reason: 'Defective item' })
    expect(raw['reason']).toBe('Defective item')
  })
})
