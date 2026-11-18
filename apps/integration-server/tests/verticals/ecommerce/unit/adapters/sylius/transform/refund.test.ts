import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawSyliusRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/sylius/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawSyliusRefund> = {}): RawSyliusRefund {
  return {
    id: 201,
    order: { id: 500, number: '000000042' },
    amount: 2499, // $24.99 in cents
    currencyCode: 'USD',
    comment: 'Customer returned defective item',
    type: 'order_item_unit',
    createdAt: '2024-03-01T09:00:00Z',
    updatedAt: '2024-03-01T10:00:00Z',
    ...overrides,
  }
}

describe('transformRefund (Sylius)', () => {
  it('maps core fields', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('201')
    expect(result.orderId).toBe('500')
    expect(result.amount).toEqual({ amount: 2499, currency: 'USD' })
    expect(result.note).toBe('Customer returned defective item')
    expect(result.restock).toBe(true)
  })

  it('converts amount from cents to decimal', () => {
    const result = transformRefund(makeRefund({ amount: 10050 }))
    expect(result.amount).toEqual({ amount: 10050, currency: 'USD' })
  })

  it('handles missing amount', () => {
    const result = transformRefund(makeRefund({ amount: undefined }))
    expect(result.amount).toBeUndefined()
  })

  it('handles missing comment', () => {
    const result = transformRefund(makeRefund({ comment: null }))
    expect(result.note).toBeUndefined()
  })

  it('extracts orderId from IRI string', () => {
    const result = transformRefund(makeRefund({ order: '/api/v2/admin/orders/42' }))
    expect(result.orderId).toBe('42')
  })

  it('defaults currency to USD', () => {
    const result = transformRefund(makeRefund({ currencyCode: undefined }))
    expect(result.amount?.currency).toBe('USD')
  })

  it('preserves metadata', () => {
    const raw = makeRefund()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies RefundSchema', () => {
    const result = transformRefund(makeRefund())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const canonical = transformRefund(makeRefund())
    const body = untransformRefund(canonical)
    expect(body['amount']).toBe(2499)
    expect(body['comment']).toBe('Customer returned defective item')
  })
})
