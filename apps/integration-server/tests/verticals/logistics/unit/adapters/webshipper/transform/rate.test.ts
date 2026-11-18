import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type WebshipperRate,
} from '../../../../../../../src/verticals/logistics/adapters/webshipper/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRaw(overrides: Partial<WebshipperRate> = {}): WebshipperRate {
  return {
    id: 77,
    type: 'rates',
    attributes: {
      service_code: 'express_parcel',
      service_name: 'Express Parcel',
      carrier_id: 42,
      currency: 'USD',
      price: '1250',
      retail_price: '1500',
      transit_time: 2,
      estimated_delivery_at: '2024-03-03T00:00:00Z',
      created_at: '2024-03-01T00:00:00Z',
    },
    ...overrides,
  }
}

describe('transformRate (webshipper)', () => {
  it('maps id to string from raw.id', () => {
    expect(transformRate(makeRaw()).id).toBe('77')
  })

  it('maps carrierId from attributes.carrier_id', () => {
    expect(transformRate(makeRaw()).carrierId).toBe('42')
  })

  it('defaults carrierId to webshipper when carrier_id absent', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, carrier_id: null } })
    expect(transformRate(raw).carrierId).toBe('webshipper')
  })

  it('maps serviceCode from attributes.service_code', () => {
    expect(transformRate(makeRaw()).serviceCode).toBe('express_parcel')
  })

  it('maps serviceName from attributes.service_name', () => {
    expect(transformRate(makeRaw()).serviceName).toBe('Express Parcel')
  })

  it('maps currency from attributes.currency', () => {
    expect(transformRate(makeRaw()).currency).toBe('USD')
  })

  it('maps totalAmount from attributes.price (string → number)', () => {
    expect(transformRate(makeRaw()).totalAmount).toBe(1250)
  })

  it('maps retailAmount from attributes.retail_price', () => {
    expect(transformRate(makeRaw()).retailAmount).toBe(1500)
  })

  it('maps transitDays from attributes.transit_time', () => {
    expect(transformRate(makeRaw()).transitDays).toBe(2)
  })

  it('maps deliveryDays from attributes.transit_time', () => {
    expect(transformRate(makeRaw()).deliveryDays).toBe(2)
  })

  it('maps estimatedDeliveryAt from attributes.estimated_delivery_at', () => {
    expect(transformRate(makeRaw()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps createdAt from attributes.created_at', () => {
    expect(transformRate(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles absent attributes gracefully', () => {
    const result = transformRate({ id: '1', type: 'rates', attributes: null })
    expect(result.carrierId).toBe('webshipper')
    expect(result.totalAmount).toBeUndefined()
  })

  it('produces output that parses against RateSchema', () => {
    expect(() => RateSchema.parse(transformRate(makeRaw()))).not.toThrow()
  })
})
