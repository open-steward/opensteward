import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawMeliRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/mercadolibre/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawMeliRefund> = {}): RawMeliRefund {
  return {
    orderId: '4000000001',
    paymentId: 50000001,
    amount: 45000,
    currency_id: 'ARS',
    reason: 'Item defectuoso',
    date_created: '2024-05-03T10:00:00.000Z',
    status: 'refunded',
    ...overrides,
  }
}

describe('transformRefund (Mercado Libre)', () => {
  it('synthesizes id as orderId:paymentId:refund', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('4000000001:50000001:refund')
  })

  it('maps orderId correctly', () => {
    const result = transformRefund(makeRefund())
    expect(result.orderId).toBe('4000000001')
  })

  it('maps amount with currency', () => {
    const result = transformRefund(makeRefund())
    expect(result.amount).toEqual({ amount: 45000, currency: 'ARS' })
  })

  it('maps reason', () => {
    const result = transformRefund(makeRefund())
    expect(result.reason).toBe('Item defectuoso')
  })

  it('maps dates', () => {
    const result = transformRefund(makeRefund())
    expect(result.processedAt).toBe('2024-05-03T10:00:00.000Z')
    expect(result.createdAt).toBe('2024-05-03T10:00:00.000Z')
  })

  it('handles missing amount gracefully', () => {
    const result = transformRefund(makeRefund({ amount: undefined, currency_id: undefined }))
    expect(result.amount).toBeUndefined()
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const result = transformRefund(makeRefund())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeRefund()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('round-trips amount via untransformRefund', () => {
    const body = untransformRefund({ amount: { amount: 45000, currency: 'ARS' } })
    expect(body['amount']).toBe(45000)
  })

  it('handles missing amount in untransformRefund', () => {
    const body = untransformRefund({})
    expect(body).toEqual({})
  })
})
