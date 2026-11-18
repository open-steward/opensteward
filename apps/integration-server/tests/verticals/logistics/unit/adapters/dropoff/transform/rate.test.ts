import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type DropoffRateQuote,
} from '../../../../../../../src/verticals/logistics/adapters/dropoff/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRate(o: Partial<DropoffRateQuote> = {}): DropoffRateQuote {
  return {
    rate_id: 'rate-001',
    carrier: 'fedex',
    service_code: 'fedex_ground',
    service_name: 'FedEx Ground',
    currency: 'USD',
    total_amount: 1299,
    retail_amount: 1550,
    transit_days: 3,
    delivery_days: 3,
    estimated_delivery: '2024-03-04T00:00:00Z',
    is_guaranteed: false,
    ...o,
  }
}

describe('dropoff transformRate', () => {
  it('maps rate_id to id', () => {
    expect(transformRate(makeRate()).id).toBe('rate-001')
  })

  it('maps carrier to carrierId', () => {
    expect(transformRate(makeRate()).carrierId).toBe('fedex')
  })

  it('defaults carrierId to dropoff when carrier absent', () => {
    expect(transformRate(makeRate({ carrier: null })).carrierId).toBe('dropoff')
  })

  it('maps service_code', () => {
    expect(transformRate(makeRate()).serviceCode).toBe('fedex_ground')
  })

  it('maps service_name', () => {
    expect(transformRate(makeRate()).serviceName).toBe('FedEx Ground')
  })

  it('maps currency', () => {
    expect(transformRate(makeRate()).currency).toBe('USD')
  })

  it('defaults currency to USD when absent', () => {
    expect(transformRate(makeRate({ currency: null })).currency).toBe('USD')
  })

  it('maps total_amount', () => {
    expect(transformRate(makeRate()).totalAmount).toBe(1299)
  })

  it('maps retail_amount', () => {
    expect(transformRate(makeRate()).retailAmount).toBe(1550)
  })

  it('maps transit_days', () => {
    expect(transformRate(makeRate()).transitDays).toBe(3)
  })

  it('maps delivery_days', () => {
    expect(transformRate(makeRate()).deliveryDays).toBe(3)
  })

  it('maps is_guaranteed', () => {
    expect(transformRate(makeRate()).isGuaranteedDelivery).toBe(false)
  })

  it('parses estimatedDeliveryAt as Date', () => {
    expect(transformRate(makeRate()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('parses string total_amount', () => {
    expect(transformRate(makeRate({ total_amount: '999' })).totalAmount).toBe(999)
  })

  it('passes RateSchema validation', () => {
    const result = transformRate(makeRate())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })

  it('metadata is the raw object', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })
})
