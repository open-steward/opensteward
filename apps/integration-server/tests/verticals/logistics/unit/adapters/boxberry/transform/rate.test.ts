import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type BoxberryTariff,
} from '../../../../../../../src/verticals/logistics/adapters/boxberry/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeTariff(overrides: Partial<BoxberryTariff> = {}): BoxberryTariff {
  return {
    price: '120.00',
    price_base: '100.00',
    price_service: '20.00',
    delivery_period: '3',
    ...overrides,
  }
}

describe('transformRate (boxberry)', () => {
  it('sets carrierId to boxberry', () => {
    expect(transformRate(makeTariff()).carrierId).toBe('boxberry')
  })

  it('sets serviceCode to boxberry_standard', () => {
    expect(transformRate(makeTariff()).serviceCode).toBe('boxberry_standard')
  })

  it('sets serviceName to Boxberry Standard', () => {
    expect(transformRate(makeTariff()).serviceName).toBe('Boxberry Standard')
  })

  it('sets currency to RUB', () => {
    expect(transformRate(makeTariff()).currency).toBe('RUB')
  })

  it('maps totalAmount from price', () => {
    expect(transformRate(makeTariff()).totalAmount).toBe(120)
  })

  it('maps retailAmount from price_base', () => {
    expect(transformRate(makeTariff()).retailAmount).toBe(100)
  })

  it('maps transitDays from delivery_period', () => {
    expect(transformRate(makeTariff()).transitDays).toBe(3)
  })

  it('maps deliveryDays equal to transitDays', () => {
    expect(transformRate(makeTariff()).deliveryDays).toBe(3)
  })

  it('handles null delivery_period gracefully', () => {
    const result = transformRate(makeTariff({ delivery_period: null }))
    expect(result.transitDays).toBeUndefined()
    expect(result.deliveryDays).toBeUndefined()
  })

  it('handles missing price gracefully', () => {
    const result = transformRate(makeTariff({ price: null }))
    expect(result.totalAmount).toBeUndefined()
  })

  it('passes metadata as original raw object', () => {
    const raw = makeTariff()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('produces output that parses against RateSchema', () => {
    expect(() => RateSchema.parse(transformRate(makeTariff()))).not.toThrow()
  })
})
