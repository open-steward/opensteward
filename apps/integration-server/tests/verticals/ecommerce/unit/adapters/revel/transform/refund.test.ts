import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawRevelRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/revel/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawRevelRefund> = {}): RawRevelRefund {
  return {
    id: 600,
    order: '/resources/Order/300/',
    amount: 5.0,
    reason: 'Customer request',
    created_date: '2024-04-02T10:00:00Z',
    ...overrides,
  }
}

describe('transformRefund (Revel)', () => {
  it('maps core fields', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('600')
    expect(result.orderId).toBe('300')
    expect(result.reason).toBe('Customer request')
  })

  it('maps amount', () => {
    const result = transformRefund(makeRefund())
    expect(result.amount).toEqual({ amount: 500, currency: 'USD' })
  })

  it('maps timestamps', () => {
    const result = transformRefund(makeRefund())
    expect(result.createdAt).toBe('2024-04-02T10:00:00Z')
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

  it('handles missing optional fields', () => {
    const minimal: RawRevelRefund = { id: 999, order: '/resources/Order/1/' }
    const result = transformRefund(minimal)
    expect(result.id).toBe('999')
    expect(result.orderId).toBe('1')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

describe('untransformRefund (Revel)', () => {
  it('maps amount and reason', () => {
    const raw = untransformRefund({ amount: { amount: 350, currency: 'USD' }, reason: 'Damaged' })
    expect(raw['amount']).toBe(3.5)
    expect(raw['reason']).toBe('Damaged')
  })
})
