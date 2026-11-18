import { describe, it, expect } from 'vitest'
import {
  transformTariff,
  transformTariffCalc,
  type CdekTariff,
  type CdekTariffCalcResponse,
} from '../../../../../../../src/verticals/logistics/adapters/cdek/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeTariff(overrides: Partial<CdekTariff> = {}): CdekTariff {
  return {
    tariff_code: 136,
    tariff_name: 'Посылка склад-склад',
    tariff_description: 'Warehouse to warehouse',
    delivery_mode: 3,
    delivery_sum: 350.0,
    currency_code: 'RUB',
    period_min: 1,
    period_max: 3,
    ...overrides,
  }
}

function makeTariffCalc(overrides: Partial<CdekTariffCalcResponse> = {}): CdekTariffCalcResponse {
  return {
    delivery_sum: 350.0,
    currency_code: 'RUB',
    period_min: 1,
    period_max: 3,
    ...overrides,
  }
}

describe('cdek transformTariff', () => {
  it('maps tariff_code to id and serviceCode as string', () => {
    const result = transformTariff(makeTariff())
    expect(result.id).toBe('136')
    expect(result.serviceCode).toBe('136')
  })

  it('maps carrierId to cdek', () => {
    expect(transformTariff(makeTariff()).carrierId).toBe('cdek')
  })

  it('maps tariff_name to serviceName', () => {
    expect(transformTariff(makeTariff()).serviceName).toBe('Посылка склад-склад')
  })

  it('maps delivery_sum to totalAmount', () => {
    expect(transformTariff(makeTariff()).totalAmount).toBeCloseTo(350.0)
  })

  it('maps currency_code to currency', () => {
    expect(transformTariff(makeTariff()).currency).toBe('RUB')
  })

  it('maps period_min to transitDays', () => {
    expect(transformTariff(makeTariff()).transitDays).toBe(1)
  })

  it('maps period_max to deliveryDays', () => {
    expect(transformTariff(makeTariff()).deliveryDays).toBe(3)
  })

  it('hardcodes isGuaranteedDelivery to false', () => {
    expect(transformTariff(makeTariff()).isGuaranteedDelivery).toBe(false)
  })

  it('preserves metadata', () => {
    const raw = makeTariff()
    expect(transformTariff(raw).metadata).toBe(raw)
  })

  it('produces output that satisfies RateSchema', () => {
    const result = transformTariff(makeTariff())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })

  it('handles null optional fields', () => {
    const result = transformTariff(
      makeTariff({
        tariff_code: null,
        tariff_name: null,
        delivery_sum: null,
        currency_code: null,
        period_min: null,
        period_max: null,
      }),
    )
    expect(result.id).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.transitDays).toBeUndefined()
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})

describe('cdek transformTariffCalc', () => {
  it('maps tariffCode param to id and serviceCode', () => {
    const result = transformTariffCalc(makeTariffCalc(), 136)
    expect(result.id).toBe('136')
    expect(result.serviceCode).toBe('136')
  })

  it('maps carrierId to cdek', () => {
    expect(transformTariffCalc(makeTariffCalc()).carrierId).toBe('cdek')
  })

  it('maps delivery_sum to totalAmount', () => {
    expect(transformTariffCalc(makeTariffCalc()).totalAmount).toBeCloseTo(350.0)
  })

  it('maps currency_code to currency', () => {
    expect(transformTariffCalc(makeTariffCalc()).currency).toBe('RUB')
  })

  it('produces output that satisfies RateSchema', () => {
    const result = transformTariffCalc(makeTariffCalc(), 136)
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})
