import { describe, it, expect } from 'vitest'
import {
  transformRate,
  unwrapQuote,
  type MothershipRateResponse,
  type MothershipQuoteResponse,
} from '../../../../../../../src/verticals/logistics/adapters/mothership/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRateResponse(overrides: Partial<MothershipRateResponse> = {}): MothershipRateResponse {
  return {
    id: 'rate-001',
    provider: 'SAIA',
    providerScac: 'SAIA',
    services: ['LTL_STD'],
    price: 79.5,
    transitDays: { minimum: 2, maximum: 4 },
    estimatedPickupDate: '2024-03-01T00:00:00Z',
    estimatedDeliveryDate: '2024-03-05T00:00:00Z',
    ...overrides,
  }
}

describe('transformRate (mothership)', () => {
  it('maps id from raw rate id', () => {
    expect(transformRate(makeRateResponse()).id).toBe('rate-001')
  })

  it('falls back to quoteId when rate id is absent', () => {
    expect(transformRate(makeRateResponse({ id: undefined }), 'quote-99').id).toBe('quote-99')
  })

  it('maps carrierId from providerScac', () => {
    expect(transformRate(makeRateResponse()).carrierId).toBe('SAIA')
  })

  it('falls back to provider when providerScac is absent', () => {
    expect(transformRate(makeRateResponse({ providerScac: undefined })).carrierId).toBe('SAIA')
  })

  it('maps serviceCode from providerScac', () => {
    expect(transformRate(makeRateResponse()).serviceCode).toBe('SAIA')
  })

  it('maps serviceName from provider', () => {
    expect(transformRate(makeRateResponse()).serviceName).toBe('SAIA')
  })

  it('maps currency to USD', () => {
    expect(transformRate(makeRateResponse()).currency).toBe('USD')
  })

  it('converts price (float) to cents integer for totalAmount', () => {
    // 79.5 USD → 7950 cents
    expect(transformRate(makeRateResponse()).totalAmount).toBe(7950)
  })

  it('maps transitDays as ceiling of (min+max)/2', () => {
    // (2+4)/2 = 3
    expect(transformRate(makeRateResponse()).transitDays).toBe(3)
  })

  it('maps transitDays to min when max is absent', () => {
    const raw = makeRateResponse({ transitDays: { minimum: 2, maximum: undefined } })
    expect(transformRate(raw).transitDays).toBe(2)
  })

  it('maps estimatedDeliveryAt as Date', () => {
    expect(transformRate(makeRateResponse()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes through metadata as the raw object', () => {
    const raw = makeRateResponse()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('produces a RateSchema-valid result', () => {
    expect(() => RateSchema.parse(transformRate(makeRateResponse()))).not.toThrow()
  })
})

describe('unwrapQuote (mothership)', () => {
  it('extracts quoteId and rates from data wrapper', () => {
    const res: MothershipQuoteResponse = {
      data: { id: 'q-1', rates: [makeRateResponse()] },
    }
    const { quoteId, rates } = unwrapQuote(res)
    expect(quoteId).toBe('q-1')
    expect(rates).toHaveLength(1)
  })

  it('falls back to root-level id and rates', () => {
    const res: MothershipQuoteResponse = { id: 'q-2', rates: [makeRateResponse()] }
    const { quoteId, rates } = unwrapQuote(res)
    expect(quoteId).toBe('q-2')
    expect(rates).toHaveLength(1)
  })
})
