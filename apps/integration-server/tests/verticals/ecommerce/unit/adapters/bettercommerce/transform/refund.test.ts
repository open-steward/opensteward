import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawBCRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/bettercommerce/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawBCRefund> = {}): RawBCRefund {
  return {
    returnId: 'ret-001',
    orderId: 'order-001',
    refundAmount: 24.99,
    currencyCode: 'GBP',
    reason: 'Damaged product',
    items: [
      {
        lineItemId: 'li-001',
        qty: 1,
        refundAmount: 24.99,
      },
    ],
    refundDate: '2024-03-01T00:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformRefund (BetterCommerce)', () => {
  it('maps returnId to id', () => {
    const result = transformRefund(makeRefund({ returnId: 'ret-001' }))
    expect(result.id).toBe('ret-001')
  })

  it('falls back to recordId', () => {
    const result = transformRefund(makeRefund({ returnId: undefined, recordId: 'rec-abc' }))
    expect(result.id).toBe('rec-abc')
  })

  it('maps orderId', () => {
    const result = transformRefund(makeRefund())
    expect(result.orderId).toBe('order-001')
  })

  it('converts refundAmount to minor units', () => {
    const result = transformRefund(makeRefund({ refundAmount: 24.99, currencyCode: 'GBP' }))
    expect(result.amount?.amount).toBe(2499)
    expect(result.amount?.currency).toBe('GBP')
  })

  it('maps reason to note', () => {
    const result = transformRefund(makeRefund())
    expect(result.note).toBe('Damaged product')
  })

  it('falls back to notes for note', () => {
    const result = transformRefund(makeRefund({ reason: undefined, notes: 'Item broken' }))
    expect(result.note).toBe('Item broken')
  })

  it('maps items to refundLineItems', () => {
    const result = transformRefund(makeRefund())
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]!.lineItemId).toBe('li-001')
    expect(result.refundLineItems![0]!.quantity).toBe(1)
    expect(result.refundLineItems![0]!.amount?.amount).toBe(2499)
  })

  it('falls back to lineItems field', () => {
    const result = transformRefund(
      makeRefund({ items: undefined, lineItems: [{ lineItemId: 'li-002', qty: 2 }] }),
    )
    expect(result.refundLineItems![0]!.lineItemId).toBe('li-002')
  })

  it('maps processedAt from refundDate', () => {
    const result = transformRefund(makeRefund())
    expect(result.processedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('maps createdAt', () => {
    const result = transformRefund(makeRefund())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
  })

  it('returns undefined amount when refundAmount is 0', () => {
    const result = transformRefund(makeRefund({ refundAmount: 0 }))
    expect(result.amount).toBeUndefined()
  })

  it('stores raw in metadata', () => {
    const raw = makeRefund()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying RefundSchema', () => {
    const result = transformRefund(makeRefund())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

describe('untransformRefund (BetterCommerce)', () => {
  it('maps orderId', () => {
    const body = untransformRefund({ orderId: 'order-001' })
    expect(body.orderId).toBe('order-001')
  })

  it('maps note to reason', () => {
    const body = untransformRefund({ note: 'Wrong size' })
    expect(body.reason).toBe('Wrong size')
  })

  it('maps refundLineItems to items', () => {
    const body = untransformRefund({
      refundLineItems: [{ lineItemId: 'li-001', quantity: 2 }],
    })
    const items = body.items as Array<Record<string, unknown>>
    expect(items[0]!.lineItemId).toBe('li-001')
    expect(items[0]!.qty).toBe(2)
  })
})
