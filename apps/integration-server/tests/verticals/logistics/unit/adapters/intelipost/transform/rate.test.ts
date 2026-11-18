import { describe, it, expect } from 'vitest'
import {
  transformDeliveryOptionToRate,
  type IntelipostDeliveryOption,
} from '../../../../../../../src/verticals/logistics/adapters/intelipost/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRaw(overrides: Partial<IntelipostDeliveryOption> = {}): IntelipostDeliveryOption {
  return {
    delivery_method_id: 42,
    delivery_method_name: 'Expresso',
    logistic_provider_name: 'Correios',
    final_shipping_cost: 25.9,
    provider_shipping_cost: 30.0,
    delivery_estimate_business_days: 3,
    delivery_estimate_date_exact_iso: '2024-03-05T00:00:00Z',
    ...overrides,
  }
}

describe('intelipost transformDeliveryOptionToRate', () => {
  it('maps delivery_method_id to id and serviceCode', () => {
    const r = transformDeliveryOptionToRate(makeRaw())
    expect(r.id).toBe('42')
    expect(r.serviceCode).toBe('42')
  })

  it('maps logistic_provider_name to carrierId', () => {
    expect(transformDeliveryOptionToRate(makeRaw()).carrierId).toBe('Correios')
  })

  it('maps final_shipping_cost to totalAmount', () => {
    expect(transformDeliveryOptionToRate(makeRaw()).totalAmount).toBe(25.9)
  })

  it('maps provider_shipping_cost to retailAmount', () => {
    expect(transformDeliveryOptionToRate(makeRaw()).retailAmount).toBe(30.0)
  })

  it('maps transit days correctly', () => {
    const r = transformDeliveryOptionToRate(makeRaw())
    expect(r.transitDays).toBe(3)
    expect(r.deliveryDays).toBe(3)
  })

  it('always sets currency to BRL', () => {
    expect(transformDeliveryOptionToRate(makeRaw()).currency).toBe('BRL')
  })

  it('estimatedDeliveryAt is a Date', () => {
    expect(transformDeliveryOptionToRate(makeRaw()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('schema validation throws because transform emits raw float amounts, but RateSchema.totalAmount requires int (minor-units)', () => {
    // The Intelipost API returns decimal BRL amounts (e.g. 25.9). parseDecimal preserves the
    // float and passes it directly to the Rate object. RateSchema.totalAmount uses the shared
    // Amount schema which requires z.number().int(). RateSchema.parse throws on fractional
    // amounts — a known schema incompatibility in the source transform.
    expect(() => RateSchema.parse(transformDeliveryOptionToRate(makeRaw()))).toThrow()
  })

  it('id is undefined when delivery_method_id is null', () => {
    const r = transformDeliveryOptionToRate(makeRaw({ delivery_method_id: null }))
    expect(r.id).toBeUndefined()
    expect(r.serviceCode).toBeUndefined()
  })

  it('uses delivery_method_name as serviceName', () => {
    expect(transformDeliveryOptionToRate(makeRaw()).serviceName).toBe('Expresso')
  })
})
