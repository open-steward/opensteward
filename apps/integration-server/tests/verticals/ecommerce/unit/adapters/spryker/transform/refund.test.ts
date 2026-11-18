import { describe, it, expect } from 'vitest'
import {
  transformReturn,
  type RawSprykerReturn,
} from '../../../../../../../src/verticals/ecommerce/adapters/spryker/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeReturn(
  overrides: Partial<RawSprykerReturn['attributes']> = {},
): RawSprykerReturn {
  return {
    type: 'returns',
    id: 'DE-Return-1',
    attributes: {
      returnReference: 'DE-Return-1',
      store: 'DE',
      returnTotals: {
        remunerationTotal: 14999,
        refundTotal: 14999,
      },
      items: [
        {
          uuid: 'item-uuid-1',
          reason: 'Item was defective',
          state: 'waiting-for-return',
          returnPolicyName: 'full-return',
          orderItem: {
            name: 'Mechanical Keyboard',
            sku: 'KEYBOARD-001',
            sumPrice: 14999,
            quantity: 1,
            idSalesOrderItem: 101,
            uuid: 'order-item-uuid-1',
          },
        },
      ],
      createdAt: '2024-03-15T08:30:00.000Z',
      ...overrides,
    },
  }
}

describe('transformReturn (Spryker)', () => {
  it('maps JSON:API id as refund id', () => {
    const result = transformReturn(makeReturn())
    expect(result.id).toBe('DE-Return-1')
  })

  it('maps refundTotal from returnTotals as amount in minor units', () => {
    const result = transformReturn(makeReturn(), 'EUR')
    // Spryker already provides minor-unit (cents)
    expect(result.amount).toEqual({ amount: 14999, currency: 'EUR' })
  })

  it('falls back to remunerationTotal when refundTotal is null', () => {
    const result = transformReturn(
      makeReturn({ returnTotals: { refundTotal: null, remunerationTotal: 5000 } }),
      'EUR',
    )
    expect(result.amount).toEqual({ amount: 5000, currency: 'EUR' })
  })

  it('maps first item reason to note', () => {
    const result = transformReturn(makeReturn())
    expect(result.note).toBe('Item was defective')
  })

  it('maps return items to refundLineItems', () => {
    const result = transformReturn(makeReturn())
    expect(result.refundLineItems).toHaveLength(1)
    const rli = result.refundLineItems![0]!
    expect(rli.lineItemId).toBe('item-uuid-1')
    expect(rli.quantity).toBe(1)
    expect(rli.amount).toEqual({ amount: 14999, currency: 'EUR' })
  })

  it('maps createdAt ISO string', () => {
    const result = transformReturn(makeReturn())
    expect(result.createdAt).toBe('2024-03-15T08:30:00.000Z')
  })

  it('defaults to empty string orderId (Spryker returns not directly linked)', () => {
    const result = transformReturn(makeReturn())
    // Source comment: orderId left undefined when not derivable, set to ''
    expect(result.orderId).toBe('')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeReturn()
    expect(transformReturn(raw).metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    expect(() => RefundSchema.parse(transformReturn(makeReturn()))).not.toThrow()
  })
})
