import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawCentraReturn,
} from '../../../../../../../src/verticals/ecommerce/adapters/centra/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeReturn(overrides: Partial<RawCentraReturn> = {}): RawCentraReturn {
  return {
    returnId: 700,
    orderId: 1001,
    shipmentId: 555,
    date: '2024-03-10T00:00:00Z',
    completed: true,
    returnCost: '50.00',
    shippingCost: '0.00',
    currency: 'SEK',
    comment: 'Wrong size',
    returnToStock: true,
    products: [
      { returnLineId: 1, shipmentLineId: 2, orderLineId: 301, quantity: 1, price: '1200.00' },
    ],
    ...overrides,
  }
}

describe('transformRefund', () => {
  it('maps returnId to id string', () => {
    const result = transformRefund(makeReturn())
    expect(result.id).toBe('700')
  })

  it('maps orderId to string', () => {
    const result = transformRefund(makeReturn())
    expect(result.orderId).toBe('1001')
  })

  it('converts returnCost to minor units (SEK)', () => {
    // 50.00 SEK → 5000 minor units
    const result = transformRefund(makeReturn())
    expect(result.amount).toEqual({ amount: 5000, currency: 'SEK' })
  })

  it('returns undefined amount when returnCost is 0', () => {
    const result = transformRefund(makeReturn({ returnCost: '0.00' }))
    expect(result.amount).toBeUndefined()
  })

  it('maps comment to note', () => {
    const result = transformRefund(makeReturn())
    expect(result.note).toBe('Wrong size')
  })

  it('maps returnToStock to restock', () => {
    const result = transformRefund(makeReturn())
    expect(result.restock).toBe(true)
  })

  it('maps refund line items using orderLineId as lineItemId', () => {
    const result = transformRefund(makeReturn())
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]!.lineItemId).toBe('301')
    expect(result.refundLineItems![0]!.quantity).toBe(1)
    // 1200.00 SEK → 120000 minor units
    expect(result.refundLineItems![0]!.amount).toEqual({ amount: 120000, currency: 'SEK' })
  })

  it('maps date to processedAt and createdAt (toIsoDatetime normalizes to .000Z form)', () => {
    const result = transformRefund(makeReturn())
    // toIsoDatetime converts via new Date().toISOString() which emits .000Z milliseconds
    expect(result.processedAt).toBe('2024-03-10T00:00:00.000Z')
    expect(result.createdAt).toBe('2024-03-10T00:00:00.000Z')
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const result = transformRefund(makeReturn())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const canonical = transformRefund(makeReturn())
    const raw = untransformRefund(canonical)
    expect(raw.comment).toBe('Wrong size')
    expect(raw.returnToStock).toBe(true)
  })
})
