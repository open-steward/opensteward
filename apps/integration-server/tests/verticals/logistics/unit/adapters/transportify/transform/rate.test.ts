import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type TransportifyQuoteEntry,
} from '../../../../../../../src/verticals/logistics/adapters/transportify/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRaw(overrides: Partial<TransportifyQuoteEntry> = {}): TransportifyQuoteEntry {
  return {
    vehicle_type_id: 7,
    vehicle_type_name: 'Motorcycle',
    total_fees: 150.0,
    currency: 'PHP',
    distance_fees: 80.0,
    way_point_fees: 20.0,
    cod_pod_fees: 0.0,
    extra_fees: 0.0,
    surcharges_fees: 50.0,
    ...overrides,
  }
}

describe('transportify transformRate', () => {
  it('converts vehicle_type_id to string id', () => {
    expect(transformRate(makeRaw()).id).toBe('7')
  })

  it('sets carrierId to "transportify"', () => {
    expect(transformRate(makeRaw()).carrierId).toBe('transportify')
  })

  it('sets serviceCode from vehicle_type_id as string', () => {
    expect(transformRate(makeRaw()).serviceCode).toBe('7')
  })

  it('maps serviceName from vehicle_type_name', () => {
    expect(transformRate(makeRaw()).serviceName).toBe('Motorcycle')
  })

  it('maps currency from raw.currency', () => {
    expect(transformRate(makeRaw()).currency).toBe('PHP')
  })

  it('sets totalAmount via parseDecimal (total_fees as-is, not ×100)', () => {
    // parseDecimal(150.0) = 150
    expect(transformRate(makeRaw()).totalAmount).toBe(150)
  })

  it('attaches metadata referencing the raw object', () => {
    const raw = makeRaw()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('passes RateSchema.parse without throwing', () => {
    expect(() => RateSchema.parse(transformRate(makeRaw()))).not.toThrow()
  })

  it('handles null vehicle_type_id gracefully — id and serviceCode become undefined', () => {
    const result = transformRate(makeRaw({ vehicle_type_id: null }))
    expect(result.id).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
  })

  it('falls back to PHP when currency is null', () => {
    // When raw.currency is null, (null ?? 'PHP') = 'PHP'
    expect(transformRate(makeRaw({ currency: null })).currency).toBe('PHP')
  })

  it('handles null total_fees gracefully — totalAmount becomes undefined', () => {
    expect(transformRate(makeRaw({ total_fees: null })).totalAmount).toBeUndefined()
  })

  it('handles null vehicle_type_name gracefully — serviceName becomes undefined', () => {
    expect(transformRate(makeRaw({ vehicle_type_name: null })).serviceName).toBeUndefined()
  })
})
