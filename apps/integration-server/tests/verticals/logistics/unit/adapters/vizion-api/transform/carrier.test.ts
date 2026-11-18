import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type VizionCarrier,
} from '../../../../../../../src/verticals/logistics/adapters/vizion-api/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

function makeCarrier(overrides: Partial<VizionCarrier> = {}): VizionCarrier {
  return {
    carrier_code: 'MAEU',
    scac: 'MAEU',
    name: 'Maersk',
    ...overrides,
  }
}

describe('transformCarrier (vizion-api)', () => {
  it('maps id from carrier_code', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.id).toBe('MAEU')
  })

  it('maps code from carrier_code', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.code).toBe('MAEU')
  })

  it('falls back code to scac when carrier_code is absent', () => {
    const result = transformCarrier(makeCarrier({ carrier_code: null }))
    expect(result.code).toBe('MAEU')
    expect(result.id).toBe('MAEU')
  })

  it('maps name from name field', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.name).toBe('Maersk')
  })

  it('falls back name to code when name is absent', () => {
    const result = transformCarrier(makeCarrier({ name: null }))
    expect(result.name).toBe('MAEU')
  })

  it('hardcodes isActive to true', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.isActive).toBe(true)
  })

  it('passes metadata through as raw object', () => {
    const raw = makeCarrier()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })

  it('passes CarrierSchema.parse without throwing', () => {
    const result = transformCarrier(makeCarrier())
    expect(() => CarrierSchema.parse(result)).not.toThrow()
  })
})
