import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawIzbergRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/izberg/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawIzbergRefund> = {}): RawIzbergRefund {
  return {
    id: 77,
    resource_uri: '/v1/refund/77/',
    merchant_order: 5001,
    amount: '29.99',
    currency: 'EUR',
    reason: 'Product damaged',
    note: 'Item arrived broken',
    status: 'completed',
    date_created: '2024-03-01T00:00:00Z',
    date_modified: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformRefund (izberg)', () => {
  it('maps id as string', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('77')
  })

  it('maps orderId from merchant_order', () => {
    const result = transformRefund(makeRefund())
    expect(result.orderId).toBe('5001')
  })

  it('prefers merchantOrderId parameter over raw.merchant_order', () => {
    const result = transformRefund(makeRefund(), 'mo-999')
    expect(result.orderId).toBe('mo-999')
  })

  it('falls back to order field when merchant_order is null', () => {
    const result = transformRefund(makeRefund({ merchant_order: null, order: 8888 }))
    expect(result.orderId).toBe('8888')
  })

  it('maps amount in minor units (EUR)', () => {
    const result = transformRefund(makeRefund())
    // 29.99 EUR → 2999 minor units
    expect(result.amount).toEqual({ amount: 2999, currency: 'EUR' })
  })

  it('omits amount when null', () => {
    const result = transformRefund(makeRefund({ amount: null }))
    expect(result.amount).toBeUndefined()
  })

  it('maps reason and note', () => {
    const result = transformRefund(makeRefund())
    expect(result.reason).toBe('Product damaged')
    expect(result.note).toBe('Item arrived broken')
  })

  it('maps createdAt and processedAt both from date_created', () => {
    // toIsoDatetime normalises to full ISO 8601 with milliseconds via Date.toISOString()
    const result = transformRefund(makeRefund())
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.processedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('defaults currency to EUR when not set', () => {
    const result = transformRefund(makeRefund({ currency: null }))
    expect(result.amount?.currency).toBe('EUR')
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeRefund()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const canonical = transformRefund(makeRefund())
    const body = untransformRefund(canonical)
    expect(body['reason']).toBe('Product damaged')
    expect(body['note']).toBe('Item arrived broken')
    expect(body['merchant_order']).toBe('5001')
    // 2999 minor → '29.99' major EUR
    expect(body['amount']).toBe('29.99')
    expect(body['currency']).toBe('EUR')
  })
})
