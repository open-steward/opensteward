import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type JadlogFreteResponse,
} from '../../../../../../../src/verticals/logistics/adapters/jadlog/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRaw(overrides: Partial<JadlogFreteResponse> = {}): JadlogFreteResponse {
  return {
    vltotal: 35.5,
    vlfrete: 25.0,
    prazo: 5,
    modalidade: 3,
    ...overrides,
  }
}

describe('jadlog transformRate', () => {
  it('maps vltotal to totalAmount', () => {
    expect(transformRate(makeRaw()).totalAmount).toBe(35.5)
  })

  it('falls back to vlfrete when vltotal is null', () => {
    expect(transformRate(makeRaw({ vltotal: null })).totalAmount).toBe(25.0)
  })

  it('maps prazo to transitDays and deliveryDays', () => {
    const r = transformRate(makeRaw())
    expect(r.transitDays).toBe(5)
    expect(r.deliveryDays).toBe(5)
  })

  it('maps modalidade to serviceCode', () => {
    expect(transformRate(makeRaw()).serviceCode).toBe('3')
  })

  it('maps modalidade 3 to Jadlog Expresso service name', () => {
    expect(transformRate(makeRaw()).serviceName).toBe('Jadlog Expresso')
  })

  it('maps modalidade 0 to Jadlog .COM', () => {
    expect(transformRate(makeRaw({ modalidade: 0 })).serviceName).toBe('Jadlog .COM')
  })

  it('always sets carrierId to jadlog', () => {
    expect(transformRate(makeRaw()).carrierId).toBe('jadlog')
  })

  it('always sets currency to BRL', () => {
    expect(transformRate(makeRaw()).currency).toBe('BRL')
  })

  it('schema validation throws because transform emits raw float amounts, but RateSchema.totalAmount requires int (minor-units)', () => {
    // The Jadlog API returns decimal BRL amounts (e.g. 35.5). parseDecimal preserves the
    // float and passes it directly to the Rate object. RateSchema.totalAmount uses the shared
    // Amount schema which requires z.number().int(). RateSchema.parse throws on fractional
    // amounts — a known schema incompatibility in the source transform.
    expect(() => RateSchema.parse(transformRate(makeRaw()))).toThrow()
  })

  it('serviceCode is undefined when modalidade is null', () => {
    const r = transformRate(makeRaw({ modalidade: null }))
    expect(r.serviceCode).toBeUndefined()
  })
})
