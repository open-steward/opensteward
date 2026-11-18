import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type TransportifyVehicleType,
} from '../../../../../../../src/verticals/logistics/adapters/transportify/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

function makeRaw(overrides: Partial<TransportifyVehicleType> = {}): TransportifyVehicleType {
  return {
    id: 7,
    name: 'Motorcycle',
    cargo_length: 0.6,
    cargo_height: 0.5,
    cargo_width: 0.5,
    cargo_weight: 20,
    cargo_cubic_meter: 0.15,
    minimum_pickup_time_now: '15min',
    minimum_pickup_time_schedule: '1h',
    minimum_pickup_time_fullday: '2h',
    minimum_pickup_time_fpr: '30min',
    ...overrides,
  }
}

describe('transportify transformCarrier', () => {
  it('converts numeric id to string', () => {
    expect(transformCarrier(makeRaw()).id).toBe('7')
  })

  it('maps name from raw.name', () => {
    expect(transformCarrier(makeRaw()).name).toBe('Motorcycle')
  })

  it('sets code equal to the stringified id', () => {
    expect(transformCarrier(makeRaw()).code).toBe('7')
  })

  it('sets isActive to true unconditionally', () => {
    expect(transformCarrier(makeRaw()).isActive).toBe(true)
  })

  it('attaches metadata referencing the raw object', () => {
    const raw = makeRaw()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })

  it('passes CarrierSchema.parse without throwing', () => {
    expect(() => CarrierSchema.parse(transformCarrier(makeRaw()))).not.toThrow()
  })

  it('handles null id gracefully — id and code become undefined', () => {
    const result = transformCarrier(makeRaw({ id: null }))
    expect(result.id).toBeUndefined()
    expect(result.code).toBeUndefined()
  })

  it('handles null name gracefully', () => {
    expect(transformCarrier(makeRaw({ name: null })).name).toBeUndefined()
  })

  it('still passes schema with null id and name', () => {
    expect(() =>
      CarrierSchema.parse(transformCarrier(makeRaw({ id: null, name: null }))),
    ).not.toThrow()
  })
})
