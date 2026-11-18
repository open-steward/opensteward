import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type ShipbubbleCourier,
} from '../../../../../../../src/verticals/logistics/adapters/shipbubble/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

function makeCarrier(overrides: Partial<ShipbubbleCourier> = {}): ShipbubbleCourier {
  return {
    name: 'DHL Nigeria',
    service_code: 'DHL-NG-01',
    status: 'operational',
    origin_country: 'NG',
    international: false,
    domestic: true,
    express: false,
    ...overrides,
  }
}

describe('transformCarrier (shipbubble)', () => {
  it('maps id and code from service_code', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.id).toBe('DHL-NG-01')
    expect(result.code).toBe('DHL-NG-01')
  })

  it('maps name from courier name', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.name).toBe('DHL Nigeria')
  })

  it('maps isActive true when status is operational', () => {
    expect(transformCarrier(makeCarrier({ status: 'operational' })).isActive).toBe(true)
  })

  it('maps isActive false when status is not operational', () => {
    expect(transformCarrier(makeCarrier({ status: 'inactive' })).isActive).toBe(false)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeCarrier()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })

  it('handles null/undefined optional fields gracefully', () => {
    const result = transformCarrier(makeCarrier({ name: null, service_code: null }))
    expect(result.id).toBeUndefined()
    expect(result.name).toBeUndefined()
  })

  it('passes CarrierSchema.parse without throwing', () => {
    const result = transformCarrier(makeCarrier())
    expect(() => CarrierSchema.parse(result)).not.toThrow()
  })
})
