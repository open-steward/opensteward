import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type ShipEngineCarrier,
} from '../../../../../../../src/verticals/logistics/adapters/shipengine/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

function makeCarrier(overrides: Partial<ShipEngineCarrier> = {}): ShipEngineCarrier {
  return {
    carrier_id: 'se-12345',
    carrier_code: 'ups',
    account_number: 'ACC-UPS-001',
    friendly_name: 'UPS',
    nickname: 'My UPS Account',
    primary: true,
    services: [
      {
        carrier_id: 'se-12345',
        carrier_code: 'ups',
        service_code: 'ups_ground',
        name: 'UPS Ground',
        domestic: true,
        international: false,
      },
    ],
    created_at: '2024-03-01T00:00:00Z',
    modified_at: '2024-03-01T12:00:00Z',
    ...overrides,
  }
}

describe('transformCarrier (shipengine)', () => {
  it('maps id from carrier_id', () => {
    expect(transformCarrier(makeCarrier()).id).toBe('se-12345')
  })

  it('maps code from carrier_code', () => {
    expect(transformCarrier(makeCarrier()).code).toBe('ups')
  })

  it('maps name from friendly_name', () => {
    expect(transformCarrier(makeCarrier()).name).toBe('UPS')
  })

  it('falls back to nickname when friendly_name is absent', () => {
    const result = transformCarrier(makeCarrier({ friendly_name: null }))
    expect(result.name).toBe('My UPS Account')
  })

  it('falls back to carrier_code when friendly_name and nickname are absent', () => {
    const result = transformCarrier(makeCarrier({ friendly_name: null, nickname: null }))
    expect(result.name).toBe('ups')
  })

  it('maps services with code and name', () => {
    const services = transformCarrier(makeCarrier()).services
    expect(services).toHaveLength(1)
    expect(services![0].code).toBe('ups_ground')
    expect(services![0].name).toBe('UPS Ground')
  })

  it('omits services when empty', () => {
    const result = transformCarrier(makeCarrier({ services: [] }))
    expect(result.services).toBeUndefined()
  })

  it('isActive is always true', () => {
    expect(transformCarrier(makeCarrier()).isActive).toBe(true)
  })

  it('maps createdAt and updatedAt as Date', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
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
