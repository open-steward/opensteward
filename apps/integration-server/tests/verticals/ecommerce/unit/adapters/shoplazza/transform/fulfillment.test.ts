import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShoplazzaFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/shoplazza/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeRaw(overrides: Partial<RawShoplazzaFulfillment> = {}): RawShoplazzaFulfillment {
  return {
    id: 50001,
    order_id: 40001,
    status: 'success',
    tracking_number: 'SL-TRK-9999',
    tracking_company: 'SF Express',
    tracking_company_code: 'SF',
    line_items: [{ id: 601, quantity: 3 }],
    created_at: '2024-04-05T10:00:00.000Z',
    updated_at: '2024-04-06T08:00:00.000Z',
    ...overrides,
  }
}

describe('shoplazza transformFulfillment', () => {
  it('maps id and order_id to strings', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.id).toBe('50001')
    expect(result.orderId).toBe('40001')
  })

  it('maps status via STATUS_MAP (success → SUCCESS)', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps cancelled status', () => {
    const result = transformFulfillment(makeRaw({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps tracking_number and tracking_company as carrier', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.trackingNumber).toBe('SL-TRK-9999')
    expect(result.carrier).toBe('SF Express')
  })

  it('falls back to tracking_company_code when tracking_company is absent', () => {
    const result = transformFulfillment(makeRaw({ tracking_company: null }))
    expect(result.carrier).toBe('SF')
  })

  it('maps line items', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]).toEqual({ lineItemId: '601', quantity: 3 })
  })

  it('does NOT carry trackingUrl (Shoplazza fulfillment has no trackingUrl field)', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.trackingUrl).toBeUndefined()
  })

  it('produces output that passes FulfillmentSchema', () => {
    const result = transformFulfillment(makeRaw())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformFulfillment', () => {
    const canonical = transformFulfillment(makeRaw())
    const back = untransformFulfillment(canonical)
    expect(back.tracking_number).toBe('SL-TRK-9999')
    expect(back.tracking_company).toBe('SF Express')
  })
})
