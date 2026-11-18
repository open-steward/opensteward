import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawDoocaRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/dooca-commerce/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawDoocaRefund> = {}): RawDoocaRefund {
  return {
    id: 77,
    order_id: 500,
    amount: '29.99',
    reason: 'Item damaged',
    note: 'Customer requested full refund',
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformRefund (Dooca Commerce)', () => {
  it('maps id as string', () => {
    const result = transformRefund(makeRefund({ id: 77 }))
    expect(result.id).toBe('77')
  })

  it('maps orderId from order_id', () => {
    const result = transformRefund(makeRefund())
    expect(result.orderId).toBe('500')
  })

  it('uses explicit orderId parameter over raw order_id', () => {
    const result = transformRefund(makeRefund(), 'explicit-order-1')
    expect(result.orderId).toBe('explicit-order-1')
  })

  it('converts amount from BRL major to minor units', () => {
    const result = transformRefund(makeRefund({ amount: '29.99' }))
    expect(result.amount).toEqual({ amount: 2999, currency: 'BRL' })
  })

  it('omits amount when amount is 0', () => {
    const result = transformRefund(makeRefund({ amount: '0' }))
    expect(result.amount).toBeUndefined()
  })

  it('maps reason', () => {
    const result = transformRefund(makeRefund())
    expect(result.reason).toBe('Item damaged')
  })

  it('maps note', () => {
    const result = transformRefund(makeRefund())
    expect(result.note).toBe('Customer requested full refund')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRefund()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying RefundSchema', () => {
    const result = transformRefund(makeRefund())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

describe('untransformRefund (Dooca Commerce)', () => {
  it('maps note', () => {
    const body = untransformRefund({ note: 'defective item' })
    expect(body['note']).toBe('defective item')
  })

  it('maps reason', () => {
    const body = untransformRefund({ reason: 'wrong size' })
    expect(body['reason']).toBe('wrong size')
  })

  it('converts minor unit amount back to BRL major units', () => {
    const body = untransformRefund({ amount: { amount: 2999, currency: 'BRL' } })
    expect(body['amount']).toBe('29.99')
  })
})
