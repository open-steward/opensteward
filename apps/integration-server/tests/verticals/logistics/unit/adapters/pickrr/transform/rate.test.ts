import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type PickrrCourierRate,
} from '../../../../../../../src/verticals/logistics/adapters/pickrr/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRate(overrides: Partial<PickrrCourierRate> = {}): PickrrCourierRate {
  return {
    courier_name: 'Delhivery',
    courier_id: 42,
    rate: 85.0,
    freight_charge: 80.0,
    cod_charge: 5.0,
    estimated_delivery_days: 3,
    etd: '2024-03-04T00:00:00Z',
    service_type: 'EXPRESS',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('pickrr transformRate', () => {
  it('maps id from courier_id as string', () => {
    expect(transformRate(makeRate()).id).toBe('42')
  })

  it('falls back id to courier_name when courier_id is null', () => {
    expect(transformRate(makeRate({ courier_id: null })).id).toBe('Delhivery')
  })

  it('maps carrierId from courier_name', () => {
    expect(transformRate(makeRate()).carrierId).toBe('Delhivery')
  })

  it('maps serviceCode from service_type', () => {
    expect(transformRate(makeRate()).serviceCode).toBe('EXPRESS')
  })

  it('falls back serviceCode to courier_name when service_type is null', () => {
    expect(transformRate(makeRate({ service_type: null })).serviceCode).toBe('Delhivery')
  })

  it('maps serviceName from courier_name', () => {
    expect(transformRate(makeRate()).serviceName).toBe('Delhivery')
  })

  it('sets currency to INR', () => {
    expect(transformRate(makeRate()).currency).toBe('INR')
  })

  it('maps totalAmount from rate field', () => {
    expect(transformRate(makeRate()).totalAmount).toBe(85.0)
  })

  it('falls back totalAmount to freight_charge when rate is null', () => {
    expect(transformRate(makeRate({ rate: null })).totalAmount).toBe(80.0)
  })

  it('maps transitDays from estimated_delivery_days rounded up', () => {
    expect(transformRate(makeRate({ estimated_delivery_days: 2.7 })).transitDays).toBe(3)
  })

  it('maps transitDays as integer from integer field', () => {
    expect(transformRate(makeRate()).transitDays).toBe(3)
  })

  it('parses etd as estimatedDeliveryAt Date', () => {
    expect(transformRate(makeRate()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('omits estimatedDeliveryAt when etd is null', () => {
    expect(transformRate(makeRate({ etd: null })).estimatedDeliveryAt).toBeUndefined()
  })

  it('passes metadata as raw object', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('passes RateSchema validation', () => {
    expect(() => RateSchema.parse(transformRate(makeRate()))).not.toThrow()
  })
})
