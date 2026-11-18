import { describe, it, expect } from 'vitest'
import {
  transformQuotationRate,
  transformRateJsonApi,
  type SkydropxQuotationRate,
  type SkydropxRateJsonApi,
} from '../../../../../../../src/verticals/logistics/adapters/skydropx/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeQuotationRate(overrides: Partial<SkydropxQuotationRate> = {}): SkydropxQuotationRate {
  return {
    amount_local: 150.0,
    currency_local: 'MXN',
    provider: 'estafeta',
    service_level_name: 'Estafeta Terrestre',
    service_level_code: 'ESTAFETA_GROUND',
    days: 3,
    total_pricing: 165.0,
    insurable: true,
    ...overrides,
  }
}

describe('Skydropx transformQuotationRate', () => {
  it('maps provider to carrierId', () => {
    const result = transformQuotationRate(makeQuotationRate())
    expect(result.carrierId).toBe('estafeta')
  })

  it('maps service_level_code to serviceCode and service_level_name to serviceName', () => {
    const result = transformQuotationRate(makeQuotationRate())
    expect(result.serviceCode).toBe('ESTAFETA_GROUND')
    expect(result.serviceName).toBe('Estafeta Terrestre')
  })

  it('maps currency_local to currency', () => {
    const result = transformQuotationRate(makeQuotationRate())
    expect(result.currency).toBe('MXN')
  })

  it('maps total_pricing to totalAmount and amount_local to retailAmount', () => {
    const result = transformQuotationRate(makeQuotationRate())
    expect(result.totalAmount).toBe(165.0)
    expect(result.retailAmount).toBe(150.0)
  })

  it('maps days to transitDays and deliveryDays', () => {
    const result = transformQuotationRate(makeQuotationRate())
    expect(result.transitDays).toBe(3)
    expect(result.deliveryDays).toBe(3)
  })

  it('passes RateSchema validation', () => {
    const result = transformQuotationRate(makeQuotationRate())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })

  it('produces undefined carrierId when provider is null', () => {
    const result = transformQuotationRate(makeQuotationRate({ provider: null }))
    expect(result.carrierId).toBeUndefined()
  })
})

describe('Skydropx transformRateJsonApi', () => {
  const raw: SkydropxRateJsonApi = {
    id: 'rate-999',
    type: 'rates',
    attributes: makeQuotationRate(),
    created_at: '2024-03-01T00:00:00Z',
  }

  it('maps id from JSON:API id', () => {
    const result = transformRateJsonApi(raw)
    expect(result.id).toBe('rate-999')
  })

  it('maps nested attributes correctly', () => {
    const result = transformRateJsonApi(raw)
    expect(result.carrierId).toBe('estafeta')
    expect(result.serviceCode).toBe('ESTAFETA_GROUND')
    expect(result.currency).toBe('MXN')
    expect(result.totalAmount).toBe(165.0)
  })

  it('maps createdAt as Date from created_at', () => {
    const result = transformRateJsonApi(raw)
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes RateSchema validation', () => {
    const result = transformRateJsonApi(raw)
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})
