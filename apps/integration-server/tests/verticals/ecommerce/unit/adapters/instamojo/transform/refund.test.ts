import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawInstamojoRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/instamojo/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawInstamojoRefund> = {}): RawInstamojoRefund {
  return {
    id: 'ref_001',
    payment_id: 'pay_xyz001',
    status: 'Refunded',
    type: 'RFD',
    body: 'Customer changed mind',
    refund_amount: '200.00',
    total_amount: '499.00',
    currency: 'INR',
    processed_at: '2024-03-02T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformRefund (instamojo)', () => {
  it('maps id and orderId from payment_id', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('ref_001')
    expect(result.orderId).toBe('pay_xyz001')
  })

  it('falls back to id as orderId when payment_id is null', () => {
    const result = transformRefund(makeRefund({ payment_id: null }))
    expect(result.orderId).toBe('ref_001')
  })

  it('maps refund_amount to minor units (INR)', () => {
    const result = transformRefund(makeRefund())
    // 200.00 INR → 20000 minor units
    expect(result.amount).toEqual({ amount: 20000, currency: 'INR' })
  })

  it('falls back to total_amount when refund_amount is absent', () => {
    const result = transformRefund(makeRefund({ refund_amount: undefined, total_amount: '499.00' }))
    // 499.00 INR → 49900
    expect(result.amount).toEqual({ amount: 49900, currency: 'INR' })
  })

  it('maps reason from type and note from body', () => {
    const result = transformRefund(makeRefund())
    expect(result.reason).toBe('RFD')
    expect(result.note).toBe('Customer changed mind')
  })

  it('maps processedAt via toIsoDatetime', () => {
    // toIsoDatetime normalises to full ISO 8601 with milliseconds via Date.toISOString()
    const result = transformRefund(makeRefund())
    expect(result.processedAt).toBe('2024-03-02T00:00:00.000Z')
  })

  it('maps createdAt via toIsoDatetime', () => {
    // toIsoDatetime normalises to full ISO 8601 with milliseconds via Date.toISOString()
    const result = transformRefund(makeRefund())
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('defaults currency to INR when not provided', () => {
    const result = transformRefund(makeRefund({ currency: undefined }))
    expect(result.amount?.currency).toBe('INR')
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
    expect(body['type']).toBe('RFD')
    expect(body['body']).toBe('Customer changed mind')
    // 20000 minor → 200.00 major INR
    expect(body['refund_amount']).toBe('200.00')
  })

  it('defaults type to PTH in untransformRefund when reason is absent', () => {
    const result = transformRefund(makeRefund({ type: null }))
    const body = untransformRefund(result)
    expect(body['type']).toBe('PTH')
  })
})
