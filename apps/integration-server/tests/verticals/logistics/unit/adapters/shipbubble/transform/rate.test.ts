import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type ShipbubbleCourierRate,
} from '../../../../../../../src/verticals/logistics/adapters/shipbubble/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRate(overrides: Partial<ShipbubbleCourierRate> = {}): ShipbubbleCourierRate {
  return {
    courier_id: 42,
    courier_name: 'GIG Logistics',
    rate_card_amount: 1500,
    total: 1200,
    service_type: 'STANDARD',
    delivery_eta_time: '2024-03-01T00:00:00Z',
    is_cod_available: true,
    ...overrides,
  }
}

describe('transformRate (shipbubble)', () => {
  it('maps id from courier_id (string-coerced)', () => {
    const result = transformRate(makeRate({ courier_id: 42 }))
    expect(result.id).toBe('42')
  })

  it('maps carrierId and serviceName from courier_name', () => {
    const result = transformRate(makeRate())
    expect(result.carrierId).toBe('GIG Logistics')
    expect(result.serviceName).toBe('GIG Logistics')
  })

  it('maps serviceCode from service_type', () => {
    expect(transformRate(makeRate()).serviceCode).toBe('STANDARD')
  })

  it('maps totalAmount from total via parseDecimal', () => {
    const result = transformRate(makeRate({ total: 950 }))
    // 950 NGN → 95000 kobo (integer minor units)
    expect(result.totalAmount).toBe(95000)
  })

  it('maps retailAmount from rate_card_amount', () => {
    // 1500 NGN → 150000 kobo (integer minor units)
    expect(transformRate(makeRate()).retailAmount).toBe(150000)
  })

  it('maps estimatedDeliveryAt as Date', () => {
    const result = transformRate(makeRate())
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles null courier_id gracefully', () => {
    const result = transformRate(makeRate({ courier_id: null }))
    expect(result.id).toBeUndefined()
  })

  it('handles null total gracefully', () => {
    const result = transformRate(makeRate({ total: null }))
    expect(result.totalAmount).toBeUndefined()
  })

  it('RateSchema.parse passes when totalAmount is a decimal (converted to integer minor-units)', () => {
    // transformRate converts 12.5 NGN → 1250 kobo, satisfying Amount = z.number().int()
    const result = transformRate(makeRate({ total: 12.5 }))
    expect(() => RateSchema.parse(result)).not.toThrow()
  })

  it('RateSchema.parse passes when totalAmount is an integer', () => {
    const result = transformRate(makeRate({ total: 1200 }))
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})
