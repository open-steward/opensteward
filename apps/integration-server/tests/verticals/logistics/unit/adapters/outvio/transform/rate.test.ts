import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type OutvioRate,
} from '../../../../../../../src/verticals/logistics/adapters/outvio/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

// NOTE: RateSchema.totalAmount and retailAmount use nullish(Amount) where Amount
// is z.number().int() (minor units). parseDecimal returns a float if the input
// is a float. We use integer values here so that schema parse succeeds.
// If a float is passed in raw (e.g. 12.50), the schema parse would throw —
// this is a quirk of the transform emitting the raw number unchanged.

function makeRawRate(overrides: Partial<OutvioRate> = {}): OutvioRate {
  return {
    id: 'rate-001',
    carrierId: 'correos',
    serviceCode: 'PAQPREMIUM',
    serviceName: 'Correos Paq Premium',
    currency: 'EUR',
    amount: 1250,
    retailAmount: 1500,
    transitDays: 2,
    deliveryDays: 3,
    estimatedDeliveryDate: '2024-03-05T00:00:00Z',
    isGuaranteed: true,
    createdAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRawRate()
    const result = transformRate(raw)

    expect(result.id).toBe('rate-001')
    expect(result.carrierId).toBe('correos')
    expect(result.serviceCode).toBe('PAQPREMIUM')
    expect(result.serviceName).toBe('Correos Paq Premium')
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(1250)
    expect(result.retailAmount).toBe(1500)
    expect(result.transitDays).toBe(2)
    expect(result.deliveryDays).toBe(3)
    expect(result.isGuaranteedDelivery).toBe(true)
  })

  it('maps estimatedDeliveryAt and createdAt to Date objects', () => {
    const raw = makeRawRate()
    const result = transformRate(raw)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes schema validation for a well-formed rate with integer amounts', () => {
    const result = transformRate(makeRawRate())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })

  it('prefers amount over total when both provided', () => {
    const raw = makeRawRate({ amount: 1000, total: 2000 })
    expect(transformRate(raw).totalAmount).toBe(1000)
  })

  it('falls back to total when amount is absent', () => {
    const raw = makeRawRate({ amount: undefined, total: 2000 })
    expect(transformRate(raw).totalAmount).toBe(2000)
  })

  it('maps snake_case fields when camelCase is absent', () => {
    const raw: OutvioRate = {
      carrier_id: 'ups',
      service_code: 'UPS_GND',
      service_name: 'UPS Ground',
      currency: 'USD',
      amount: 800,
      retail_amount: 1000,
      transit_days: 3,
      delivery_days: 4,
      estimated_delivery_date: '2024-03-08T00:00:00Z',
      is_guaranteed: false,
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRate(raw)
    expect(result.carrierId).toBe('ups')
    expect(result.serviceCode).toBe('UPS_GND')
    expect(result.serviceName).toBe('UPS Ground')
    expect(result.transitDays).toBe(3)
    expect(result.deliveryDays).toBe(4)
    expect(result.isGuaranteedDelivery).toBe(false)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('falls back to carrier field when carrierId and carrier_id are absent', () => {
    const raw: OutvioRate = { carrier: 'dhl', currency: 'EUR', amount: 999 }
    expect(transformRate(raw).carrierId).toBe('dhl')
  })

  it('rounds transitDays to the nearest integer', () => {
    const raw = makeRawRate({ transitDays: 2.7 })
    expect(transformRate(raw).transitDays).toBe(3)
  })

  it('rounds deliveryDays to the nearest integer', () => {
    const raw = makeRawRate({ deliveryDays: 3.2 })
    expect(transformRate(raw).deliveryDays).toBe(3)
  })

  it('omits totalAmount when amount and total are null', () => {
    const raw = makeRawRate({ amount: null, total: null })
    expect(transformRate(raw).totalAmount).toBeUndefined()
  })

  it('omits retailAmount when retail_amount is null', () => {
    const raw = makeRawRate({ retailAmount: null, retail_amount: null })
    expect(transformRate(raw).retailAmount).toBeUndefined()
  })

  it('passes through metadata as the raw object', () => {
    const raw = makeRawRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw: OutvioRate = { currency: 'EUR' }
    const result = transformRate(raw)

    expect(result.id).toBeUndefined()
    expect(result.carrierId).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.transitDays).toBeUndefined()
    expect(result.estimatedDeliveryAt).toBeUndefined()
    expect(result.isGuaranteedDelivery).toBeUndefined()
  })
})
