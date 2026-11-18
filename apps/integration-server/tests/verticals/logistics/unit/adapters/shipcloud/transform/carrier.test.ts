import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type ShipcloudCarrier,
} from '../../../../../../../src/verticals/logistics/adapters/shipcloud/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

function makeCarrier(overrides: Partial<ShipcloudCarrier> = {}): ShipcloudCarrier {
  return {
    name: 'dhl',
    display_name: 'DHL',
    services: [
      { name: 'standard', display_name: 'DHL Standard' },
      { name: 'express', display_name: 'DHL Express' },
    ],
    ...overrides,
  }
}

describe('transformCarrier (shipcloud)', () => {
  it('maps id and code from carrier name', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.id).toBe('dhl')
    expect(result.code).toBe('dhl')
  })

  it('maps name from display_name', () => {
    expect(transformCarrier(makeCarrier()).name).toBe('DHL')
  })

  it('falls back to name when display_name is absent', () => {
    const result = transformCarrier(makeCarrier({ display_name: null }))
    expect(result.name).toBe('dhl')
  })

  it('maps services with code and name', () => {
    const services = transformCarrier(makeCarrier()).services
    expect(services).toHaveLength(2)
    expect(services![0].code).toBe('standard')
    expect(services![0].name).toBe('DHL Standard')
    expect(services![1].code).toBe('express')
  })

  it('isActive is always true', () => {
    expect(transformCarrier(makeCarrier()).isActive).toBe(true)
  })

  it('omits services when array is empty', () => {
    const result = transformCarrier(makeCarrier({ services: [] }))
    expect(result.services).toBeUndefined()
  })

  it('passes metadata as original raw object', () => {
    const raw = makeCarrier()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })

  it('passes CarrierSchema.parse without throwing', () => {
    const result = transformCarrier(makeCarrier())
    expect(() => CarrierSchema.parse(result)).not.toThrow()
  })
})
