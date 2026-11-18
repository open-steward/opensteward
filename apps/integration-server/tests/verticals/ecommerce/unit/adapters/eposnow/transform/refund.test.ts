import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawEposNowRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/eposnow/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawEposNowRefund> = {}): RawEposNowRefund {
  return {
    Id: 6001,
    TransactionId: 80001,
    Amount: 3.5,
    Reason: 'Wrong order',
    DateTime: '2024-06-16T10:00:00Z',
    CreatedDate: '2024-06-16T10:00:00Z',
    ...overrides,
  }
}

describe('transformRefund (Epos Now)', () => {
  it('maps core fields', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('6001')
    expect(result.orderId).toBe('80001')
    expect(result.amount).toEqual({ amount: 350, currency: 'GBP' })
  })

  it('maps reason', () => {
    const result = transformRefund(makeRefund())
    expect(result.reason).toBe('Wrong order')
  })

  it('maps timestamps', () => {
    const result = transformRefund(makeRefund())
    expect(result.processedAt).toBe('2024-06-16T10:00:00Z')
    expect(result.createdAt).toBe('2024-06-16T10:00:00Z')
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
    const result = transformRefund(makeRefund({ Amount: undefined }))
    expect(result.amount).toBeUndefined()
  })
})

describe('untransformRefund (Epos Now)', () => {
  it('converts amount back', () => {
    const raw = untransformRefund({ amount: { amount: 350, currency: 'GBP' } })
    expect(raw['Amount']).toBe(3.5)
  })

  it('passes through reason', () => {
    const raw = untransformRefund({ reason: 'Defective item' })
    expect(raw['Reason']).toBe('Defective item')
  })

  it('maps orderId to TransactionId as number', () => {
    const raw = untransformRefund({ orderId: '80001' })
    expect(raw['TransactionId']).toBe(80001)
  })
})
