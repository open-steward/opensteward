import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type CargusRate,
} from '../../../../../../../src/verticals/logistics/adapters/cargus/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRaw(overrides: Partial<CargusRate> = {}): CargusRate {
  return {
    ServiceId: 3,
    ServiceName: 'Standard',
    // Use integer-valued prices so MoneySchema / Amount (int minor-units) validates.
    // Cargus may send decimal prices in practice, but for schema-pass assertions we
    // need whole numbers.
    TotalPrice: 30,
    BasePrice: 25,
    Currency: 'RON',
    EstimatedDeliveryDays: 2,
    ...overrides,
  }
}

describe('cargus transformRate', () => {
  it('maps carrierId to cargus', () => {
    expect(transformRate(makeRaw()).carrierId).toBe('cargus')
  })

  it('maps ServiceId to id and serviceCode as string', () => {
    const result = transformRate(makeRaw({ ServiceId: 3 }))
    expect(result.id).toBe('3')
    expect(result.serviceCode).toBe('3')
  })

  it('maps ServiceName to serviceName', () => {
    expect(transformRate(makeRaw()).serviceName).toBe('Standard')
  })

  it('maps TotalPrice to totalAmount', () => {
    expect(transformRate(makeRaw()).totalAmount).toBe(30)
  })

  it('maps BasePrice to retailAmount', () => {
    expect(transformRate(makeRaw()).retailAmount).toBe(25)
  })

  it('maps Currency', () => {
    expect(transformRate(makeRaw()).currency).toBe('RON')
  })

  it('defaults currency to RON when Currency is missing', () => {
    expect(transformRate(makeRaw({ Currency: null })).currency).toBe('RON')
  })

  it('maps EstimatedDeliveryDays to transitDays and deliveryDays', () => {
    const result = transformRate(makeRaw({ EstimatedDeliveryDays: 2 }))
    expect(result.transitDays).toBe(2)
    expect(result.deliveryDays).toBe(2)
  })

  it('preserves metadata', () => {
    const raw = makeRaw()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('produces output that satisfies RateSchema', () => {
    const result = transformRate(makeRaw())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })

  it('handles null optional fields', () => {
    const result = transformRate(
      makeRaw({
        ServiceId: null,
        ServiceName: null,
        TotalPrice: null,
        BasePrice: null,
        EstimatedDeliveryDays: null,
      }),
    )
    expect(result.id).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.transitDays).toBeUndefined()
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})
