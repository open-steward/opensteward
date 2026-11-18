import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type ShipEngineRate,
} from '../../../../../../../src/verticals/logistics/adapters/shipengine/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRate(overrides: Partial<ShipEngineRate> = {}): ShipEngineRate {
  return {
    rate_id: 'se-rate-001',
    rate_type: 'shipment',
    carrier_id: 'se-12345',
    carrier_code: 'ups',
    service_code: 'ups_ground',
    service_type: 'UPS Ground',
    carrier_friendly_name: 'UPS',
    shipping_amount: { currency: 'USD', amount: 1250 },
    insurance_amount: { currency: 'USD', amount: 0 },
    confirmation_amount: { currency: 'USD', amount: 0 },
    other_amount: { currency: 'USD', amount: 0 },
    delivery_days: 3,
    guaranteed_service: false,
    estimated_delivery_date: '2024-03-05T00:00:00Z',
    ship_date: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformRate (shipengine)', () => {
  it('maps id from rate_id', () => {
    expect(transformRate(makeRate()).id).toBe('se-rate-001')
  })

  it('maps carrierId from carrier_id', () => {
    expect(transformRate(makeRate()).carrierId).toBe('se-12345')
  })

  it('maps serviceCode from service_code', () => {
    expect(transformRate(makeRate()).serviceCode).toBe('ups_ground')
  })

  it('maps serviceName from service_type', () => {
    expect(transformRate(makeRate()).serviceName).toBe('UPS Ground')
  })

  it('maps currency from shipping_amount.currency', () => {
    expect(transformRate(makeRate()).currency).toBe('USD')
  })

  it('maps totalAmount as sum of all cost components converted to minor units', () => {
    // 1250 + 0 + 0 + 0 = 1250 major units → 125000 minor units
    expect(transformRate(makeRate()).totalAmount).toBe(125000)
  })

  it('maps transitDays and deliveryDays from delivery_days', () => {
    const result = transformRate(makeRate())
    expect(result.transitDays).toBe(3)
    expect(result.deliveryDays).toBe(3)
  })

  it('maps isGuaranteedDelivery from guaranteed_service', () => {
    expect(transformRate(makeRate({ guaranteed_service: true })).isGuaranteedDelivery).toBe(true)
    expect(transformRate(makeRate({ guaranteed_service: false })).isGuaranteedDelivery).toBe(false)
  })

  it('maps estimatedDeliveryAt as Date', () => {
    expect(transformRate(makeRate()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps createdAt as Date from ship_date', () => {
    expect(transformRate(makeRate()).createdAt).toBeInstanceOf(Date)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('RateSchema.parse passes when totalAmount is converted to integer minor-units', () => {
    // 12.5 major units → Math.round(12.5 * 100) = 1250 minor units (integer)
    const result = transformRate(makeRate({ shipping_amount: { currency: 'USD', amount: 12.5 } }))
    expect(() => RateSchema.parse(result)).not.toThrow()
  })

  it('RateSchema.parse passes when all amounts are integers summing to an integer', () => {
    const result = transformRate(makeRate())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})
