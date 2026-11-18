import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawKauflandRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/kaufland-marketplace/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawKauflandRefund> = {}): RawKauflandRefund {
  return {
    id_refund: 6001,
    id_order_unit: 8001,
    id_order: 'KL-ORD-1',
    amount: 1500,
    currency: 'EUR',
    reason: 'Defective item',
    ts_created_iso: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformRefund (kaufland-marketplace)', () => {
  it('maps id_refund to string id', () => {
    const result = transformRefund(makeRefund({ id_refund: 42 }))
    expect(result.id).toBe('42')
  })

  it('falls back to id_order_unit as id when id_refund is null', () => {
    const result = transformRefund(makeRefund({ id_refund: null, id_order_unit: 8001 }))
    expect(result.id).toBe('8001')
  })

  it('maps id_order to orderId', () => {
    const result = transformRefund(makeRefund())
    expect(result.orderId).toBe('KL-ORD-1')
  })

  it('maps amount with currency', () => {
    const result = transformRefund(makeRefund({ amount: 1500, currency: 'EUR' }))
    expect(result.amount?.amount).toBe(1500)
    expect(result.amount?.currency).toBe('EUR')
  })

  it('defaults currency to EUR when not specified', () => {
    const result = transformRefund(makeRefund({ currency: null }))
    expect(result.amount?.currency).toBe('EUR')
  })

  it('sets amount to undefined when amount is null', () => {
    const result = transformRefund(makeRefund({ amount: null }))
    expect(result.amount).toBeUndefined()
  })

  it('maps reason', () => {
    const result = transformRefund(makeRefund())
    expect(result.reason).toBe('Defective item')
  })

  it('falls back to return_reason when reason is null', () => {
    const result = transformRefund(makeRefund({ reason: null, return_reason: 'Customer return' }))
    expect(result.reason).toBe('Customer return')
  })

  it('synthesises refundLineItems with id_order_unit', () => {
    const result = transformRefund(makeRefund({ id_order_unit: 8001 }))
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems?.[0]?.lineItemId).toBe('8001')
    expect(result.refundLineItems?.[0]?.quantity).toBe(1)
  })

  it('maps ts_created_iso to createdAt', () => {
    const result = transformRefund(makeRefund())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
  })

  it('stores raw payload in metadata', () => {
    const raw = makeRefund()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying RefundSchema', () => {
    const result = transformRefund(makeRefund())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

describe('untransformRefund (kaufland-marketplace)', () => {
  it('maps amount.amount to amount', () => {
    const body = untransformRefund({ amount: { amount: 500, currency: 'EUR' } })
    expect(body.amount).toBe(500)
  })

  it('maps reason', () => {
    const body = untransformRefund({ reason: 'Not as described' })
    expect(body.reason).toBe('Not as described')
  })

  it('round-trips amount and reason', () => {
    const canonical = transformRefund(makeRefund())
    const body = untransformRefund(canonical)
    expect(body.amount).toBe(1500)
    expect(body.reason).toBe('Defective item')
  })
})
