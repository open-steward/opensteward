import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type BorzoCalculateResponse,
} from '../../../../../../../src/verticals/logistics/adapters/borzo/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeResponse(overrides: Partial<BorzoCalculateResponse> = {}): BorzoCalculateResponse {
  return {
    is_successful: true,
    order: {
      payment_amount: '450.00',
      delivery_fee_amount: '100.00',
      weight_fee_amount: '50.00',
      insurance_fee_amount: '10.00',
      loading_fee_amount: '0.00',
      vehicle_type_id: 8,
    },
    errors: [],
    ...overrides,
  }
}

describe('transformRate (borzo)', () => {
  it('sets carrierId to borzo', () => {
    expect(transformRate(makeResponse()).carrierId).toBe('borzo')
  })

  it('maps serviceCode from vehicle_type_id', () => {
    expect(transformRate(makeResponse()).serviceCode).toBe('8')
  })

  it('maps serviceName for vehicle_type_id 8 → Motorbike', () => {
    expect(transformRate(makeResponse()).serviceName).toBe('Motorbike')
  })

  it('maps serviceName for vehicle_type_id 9 → Car', () => {
    const result = transformRate(
      makeResponse({ order: { payment_amount: '500', vehicle_type_id: 9 } }),
    )
    expect(result.serviceName).toBe('Car')
  })

  it('maps totalAmount from payment_amount', () => {
    expect(transformRate(makeResponse()).totalAmount).toBe(450)
  })

  it('sets currency to INR', () => {
    expect(transformRate(makeResponse()).currency).toBe('INR')
  })

  it('handles null order gracefully', () => {
    const result = transformRate(makeResponse({ order: null }))
    expect(result.carrierId).toBe('borzo')
    expect(result.serviceCode).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.serviceName).toBe('Standard Delivery')
  })

  it('handles missing payment_amount gracefully', () => {
    const result = transformRate(
      makeResponse({ order: { payment_amount: null, vehicle_type_id: 7 } }),
    )
    expect(result.totalAmount).toBeUndefined()
  })

  it('passes metadata as original raw object', () => {
    const raw = makeResponse()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('produces output that parses against RateSchema', () => {
    const result = transformRate(makeResponse())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})
