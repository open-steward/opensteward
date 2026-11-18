import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type Kobo360RateResponse,
} from '../../../../../../../src/verticals/logistics/adapters/kobo360/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRate(o: Partial<Kobo360RateResponse> = {}): Kobo360RateResponse {
  return {
    id: 'rate-1',
    service_type: 'FTL_STANDARD',
    service_name: 'Full Truck Load – Standard',
    // Integer minor units — Amount schema requires .int()
    total_price: 250000,
    currency: 'NGN',
    estimated_delivery_date: '2024-03-01T00:00:00Z',
    transit_days: 2,
    guaranteed: false,
    ...o,
  }
}

describe('kobo360 transformRate', () => {
  it('maps id', () => {
    expect(transformRate(makeRate()).id).toBe('rate-1')
  })

  it('falls back to quote_id when id absent', () => {
    expect(transformRate(makeRate({ id: undefined, quote_id: 'q-42' })).id).toBe('q-42')
  })

  it('always sets carrierId to kobo360', () => {
    expect(transformRate(makeRate()).carrierId).toBe('kobo360')
  })

  it('maps service_type to serviceCode', () => {
    expect(transformRate(makeRate()).serviceCode).toBe('FTL_STANDARD')
  })

  it('maps service_name to serviceName', () => {
    expect(transformRate(makeRate()).serviceName).toBe('Full Truck Load – Standard')
  })

  it('maps currency', () => {
    expect(transformRate(makeRate()).currency).toBe('NGN')
  })

  it('defaults currency to NGN when absent', () => {
    expect(transformRate(makeRate({ currency: undefined })).currency).toBe('NGN')
  })

  it('maps total_price to totalAmount', () => {
    expect(transformRate(makeRate()).totalAmount).toBe(250000)
  })

  it('maps transit_days', () => {
    expect(transformRate(makeRate()).transitDays).toBe(2)
  })

  it('maps guaranteed to isGuaranteedDelivery', () => {
    expect(transformRate(makeRate()).isGuaranteedDelivery).toBe(false)
  })

  it('maps estimated_delivery_date to Date', () => {
    expect(transformRate(makeRate()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('attaches metadata', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('validates against RateSchema', () => {
    const result = transformRate(makeRate())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})
