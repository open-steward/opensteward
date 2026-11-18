import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type MelhorEnvioRate,
} from '../../../../../../../src/verticals/logistics/adapters/melhor-envio/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRate(overrides: Partial<MelhorEnvioRate> = {}): MelhorEnvioRate {
  return {
    id: 3,
    name: 'SEDEX',
    company: { id: 1, name: 'Correios', picture: null },
    code: 'sedex',
    price: '29.90',
    custom_price: '25.00',
    retail_price: '35.00',
    currency: 'BRL',
    delivery_time: 2,
    delivery_max: 3,
    delivery_range: { min: 2, max: 3 },
    ...overrides,
  }
}

describe('transformRate (melhor-envio)', () => {
  it('maps id as string from numeric id', () => {
    expect(transformRate(makeRate()).id).toBe('3')
  })

  it('derives carrierId from company name', () => {
    expect(transformRate(makeRate()).carrierId).toBe('correios')
  })

  it('defaults carrierId to "melhor-envio" when company is absent', () => {
    expect(transformRate(makeRate({ company: null })).carrierId).toBe('melhor-envio')
  })

  it('maps serviceCode from code field', () => {
    expect(transformRate(makeRate()).serviceCode).toBe('sedex')
  })

  it('maps serviceName from name field', () => {
    expect(transformRate(makeRate()).serviceName).toBe('SEDEX')
  })

  it('prefers custom_price over price for totalAmount', () => {
    // custom_price = 25.00 → totalAmount = 25.00 (not converted to cents)
    expect(transformRate(makeRate()).totalAmount).toBe(25)
  })

  it('uses price when custom_price is absent', () => {
    const result = transformRate(makeRate({ custom_price: null }))
    expect(result.totalAmount).toBe(29.9)
  })

  it('maps retailAmount from retail_price', () => {
    expect(transformRate(makeRate()).retailAmount).toBe(35)
  })

  it('maps currency', () => {
    expect(transformRate(makeRate()).currency).toBe('BRL')
  })

  it('defaults currency to BRL when absent', () => {
    expect(transformRate(makeRate({ currency: null })).currency).toBe('BRL')
  })

  it('maps transitDays from custom_delivery_time if present, else delivery_range.min, else delivery_time', () => {
    // No custom_delivery_time → uses delivery_range.min (2)
    expect(transformRate(makeRate({ custom_delivery_time: null })).transitDays).toBe(2)
    // custom_delivery_time present → uses that
    expect(transformRate(makeRate({ custom_delivery_time: 1 })).transitDays).toBe(1)
  })

  it('passes through metadata as the raw object', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('produces a RateSchema-valid result', () => {
    expect(() => RateSchema.parse(transformRate(makeRate()))).not.toThrow()
  })
})
