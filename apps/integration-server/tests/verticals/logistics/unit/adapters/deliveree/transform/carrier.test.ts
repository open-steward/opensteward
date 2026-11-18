import { describe, it, expect } from 'vitest'
import {
  transformVehicleType,
  type DelivereeVehicleType,
} from '../../../../../../../src/verticals/logistics/adapters/deliveree/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

function makeVehicleType(overrides: Partial<DelivereeVehicleType> = {}): DelivereeVehicleType {
  return {
    id: 101,
    name: 'Motorbike',
    cargo_length: 100,
    cargo_height: 60,
    cargo_width: 60,
    cargo_weight: 50,
    cargo_cubic_meter: 0.36,
    minimum_pickup_time_now: '15',
    minimum_pickup_time_schedule: '60',
    ...overrides,
  }
}

describe('deliveree transformVehicleType', () => {
  it('maps id to string', () => {
    const result = transformVehicleType(makeVehicleType())
    expect(result.id).toBe('101')
    expect(result.code).toBe('101')
  })

  it('maps name', () => {
    const result = transformVehicleType(makeVehicleType())
    expect(result.name).toBe('Motorbike')
  })

  it('sets isActive to true', () => {
    const result = transformVehicleType(makeVehicleType())
    expect(result.isActive).toBe(true)
  })

  it('passes schema validation', () => {
    const result = transformVehicleType(makeVehicleType())
    expect(() => CarrierSchema.parse(result)).not.toThrow()
  })

  it('handles null id gracefully', () => {
    const result = transformVehicleType(makeVehicleType({ id: null }))
    expect(result.id).toBeUndefined()
    expect(result.code).toBeUndefined()
  })

  it('handles null name gracefully', () => {
    const result = transformVehicleType(makeVehicleType({ name: null }))
    expect(result.name).toBeUndefined()
  })

  it('passes metadata through', () => {
    const raw = makeVehicleType()
    const result = transformVehicleType(raw)
    expect(result.metadata).toBe(raw)
  })
})
