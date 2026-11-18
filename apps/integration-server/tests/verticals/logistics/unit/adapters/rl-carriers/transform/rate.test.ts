import { describe, it, expect } from 'vitest'
import {
  transformRateQuote,
  type RlCarriersRateQuoteResponse,
  type RlCarriersServiceLevel,
} from '../../../../../../../src/verticals/logistics/adapters/rl-carriers/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeServiceLevel(overrides: Partial<RlCarriersServiceLevel> = {}): RlCarriersServiceLevel {
  return {
    Title: 'Standard LTL',
    Code: 'LTL',
    QuoteNumber: 'QN-001',
    ServiceDays: 3,
    Charge: 250.0,
    NetCharge: 220.0,
    ...overrides,
  }
}

function makeRaw(
  overrides: Partial<RlCarriersRateQuoteResponse> = {},
): RlCarriersRateQuoteResponse {
  return {
    QuoteNumber: 'QN-001',
    PickupDate: '2024-03-01T00:00:00Z',
    Origin: { City: 'Chicago', StateOrProvince: 'IL', ZipOrPostalCode: '60601', CountryCode: 'US' },
    Destination: {
      City: 'Los Angeles',
      StateOrProvince: 'CA',
      ZipOrPostalCode: '90001',
      CountryCode: 'US',
    },
    ServiceLevels: [makeServiceLevel()],
    Charges: [],
    ...overrides,
  }
}

// ─── transformRateQuote ───────────────────────────────────────────────────────

describe('RL-Carriers transformRateQuote', () => {
  it('produces one Rate per ServiceLevel', () => {
    const rates = transformRateQuote(makeRaw())
    expect(rates).toHaveLength(1)
  })

  it('maps carrierId to rl-carriers', () => {
    expect(transformRateQuote(makeRaw())[0].carrierId).toBe('rl-carriers')
  })

  it('maps serviceCode and serviceName from ServiceLevel', () => {
    const rate = transformRateQuote(makeRaw())[0]
    expect(rate.serviceCode).toBe('LTL')
    expect(rate.serviceName).toBe('Standard LTL')
  })

  it('uses NetCharge over Charge as totalAmount', () => {
    const rate = transformRateQuote(makeRaw())[0]
    expect(rate.totalAmount).toBe(220.0)
  })

  it('falls back to Charge when NetCharge is absent', () => {
    const rate = transformRateQuote(
      makeRaw({ ServiceLevels: [makeServiceLevel({ NetCharge: undefined })] }),
    )[0]
    expect(rate.totalAmount).toBe(250.0)
  })

  it('maps ServiceDays to transitDays', () => {
    const rate = transformRateQuote(makeRaw())[0]
    expect(rate.transitDays).toBe(3)
  })

  it('maps currency to USD', () => {
    expect(transformRateQuote(makeRaw())[0].currency).toBe('USD')
  })

  it('sets isGuaranteedDelivery to false', () => {
    expect(transformRateQuote(makeRaw())[0].isGuaranteedDelivery).toBe(false)
  })

  it('falls back to aggregate STANDARD rate when no ServiceLevels', () => {
    const rates = transformRateQuote(
      makeRaw({
        ServiceLevels: [],
        Charges: [
          { Type: 'BASE', Amount: 150.0 },
          { Type: 'FUEL', Amount: 30.0 },
        ],
      }),
    )
    expect(rates).toHaveLength(1)
    expect(rates[0].serviceCode).toBe('STANDARD')
    expect(rates[0].totalAmount).toBe(180.0)
  })

  it('aggregate rate total is 0/undefined when Charges are empty', () => {
    const rates = transformRateQuote(makeRaw({ ServiceLevels: [], Charges: [] }))
    expect(rates[0].totalAmount).toBeUndefined()
  })

  it('passes RateSchema.parse for each rate without throwing', () => {
    const rates = transformRateQuote(makeRaw())
    rates.forEach((r) => expect(() => RateSchema.parse(r)).not.toThrow())
  })

  it('handles multiple service levels', () => {
    const rates = transformRateQuote(
      makeRaw({
        ServiceLevels: [
          makeServiceLevel({ Code: 'LTL', NetCharge: 220 }),
          makeServiceLevel({ Code: 'GUARANTEED', NetCharge: 350 }),
        ],
      }),
    )
    expect(rates).toHaveLength(2)
    expect(rates[1].serviceCode).toBe('GUARANTEED')
    expect(rates[1].totalAmount).toBe(350)
  })
})
