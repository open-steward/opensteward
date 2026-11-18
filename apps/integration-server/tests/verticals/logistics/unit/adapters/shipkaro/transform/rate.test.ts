import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type ShipKaroCourierRate,
} from '../../../../../../../src/verticals/logistics/adapters/shipkaro/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRaw(overrides: Partial<ShipKaroCourierRate> = {}): ShipKaroCourierRate {
  return {
    courier_company_id: 5,
    courier_name: 'BlueDart',
    courier_type: 'EXPRESS',
    freight_charge: 85,
    rate: 90,
    estimated_delivery_days: '3',
    etd: '2024-03-04T00:00:00Z',
    is_surface: false,
    ...overrides,
  }
}

describe('transformRate', () => {
  it('maps id as string from courier_company_id', () => {
    expect(transformRate(makeRaw()).id).toBe('5')
  })

  it('maps carrierId from courier_name', () => {
    expect(transformRate(makeRaw()).carrierId).toBe('BlueDart')
  })

  it('maps serviceCode from courier_type', () => {
    expect(transformRate(makeRaw()).serviceCode).toBe('EXPRESS')
  })

  it('maps serviceName from courier_name', () => {
    expect(transformRate(makeRaw()).serviceName).toBe('BlueDart')
  })

  it('always emits INR currency', () => {
    expect(transformRate(makeRaw()).currency).toBe('INR')
  })

  it('maps totalAmount from rate field', () => {
    expect(transformRate(makeRaw()).totalAmount).toBe(90)
  })

  it('falls back to freight_charge when rate absent', () => {
    expect(transformRate(makeRaw({ rate: null })).totalAmount).toBe(85)
  })

  it('maps transitDays ceiled from string estimated_delivery_days', () => {
    expect(transformRate(makeRaw({ estimated_delivery_days: '2.5' })).transitDays).toBe(3)
  })

  it('maps transitDays as integer', () => {
    expect(transformRate(makeRaw({ estimated_delivery_days: 3 })).transitDays).toBe(3)
  })

  it('maps estimatedDeliveryAt from etd', () => {
    expect(transformRate(makeRaw()).estimatedDeliveryAt).toEqual(new Date('2024-03-04T00:00:00Z'))
  })

  it('passes schema validation', () => {
    const result = transformRate(makeRaw())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })

  it('passes metadata through unmodified', () => {
    const raw = makeRaw()
    expect(transformRate(raw).metadata).toBe(raw)
  })
})
