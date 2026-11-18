import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawFabricRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/fabric/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawFabricRefund> = {}): RawFabricRefund {
  return {
    id: 'ref-001',
    order_id: 'ord-001',
    amount: 25.50,
    currency: 'USD',
    reason: 'Damaged item',
    note: 'Customer reported damage on arrival',
    restock: true,
    line_items: [
      { line_item_id: 'li-001', quantity: 1, amount: 25.50, currency: 'USD' },
    ],
    transaction_ids: ['tx-001'],
    processed_at: '2024-07-05T10:00:00Z',
    created_at: '2024-07-05T09:30:00Z',
    ...overrides,
  }
}

describe('transformRefund (fabric)', () => {
  it('maps core fields', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('ref-001')
    expect(result.orderId).toBe('ord-001')
    expect(result.amount).toEqual({ amount: 2550, currency: 'USD' })
    expect(result.reason).toBe('Damaged item')
    expect(result.note).toBe('Customer reported damage on arrival')
    expect(result.restock).toBe(true)
  })

  it('maps refund line items', () => {
    const result = transformRefund(makeRefund())
    expect(result.refundLineItems).toHaveLength(1)
    const li = result.refundLineItems![0]!
    expect(li.lineItemId).toBe('li-001')
    expect(li.quantity).toBe(1)
    expect(li.amount).toEqual({ amount: 2550, currency: 'USD' })
  })

  it('maps transaction IDs', () => {
    const result = transformRefund(makeRefund())
    expect(result.transactionIds).toEqual(['tx-001'])
  })

  it('handles missing amount', () => {
    const result = transformRefund(makeRefund({ amount: undefined }))
    expect(result.amount).toBeUndefined()
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeRefund()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const result = transformRefund(makeRefund())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

describe('untransformRefund (fabric)', () => {
  it('round-trips writable fields', () => {
    const body = untransformRefund({
      amount: { amount: 2550, currency: 'USD' },
      reason: 'Damaged',
      restock: true,
    }) as Record<string, unknown>
    expect(body['amount']).toBe(25.50)
    expect(body['currency']).toBe('USD')
    expect(body['reason']).toBe('Damaged')
    expect(body['restock']).toBe(true)
  })
})
