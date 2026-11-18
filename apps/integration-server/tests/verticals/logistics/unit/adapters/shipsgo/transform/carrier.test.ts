import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type ShipsGoOceanCarrier,
} from '../../../../../../../src/verticals/logistics/adapters/shipsgo/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

function makeCarrier(overrides: Partial<ShipsGoOceanCarrier> = {}): ShipsGoOceanCarrier {
  return {
    scac: 'MSCU',
    name: 'MSC',
    status: 'ACTIVE',
    ...overrides,
  }
}

describe('transformCarrier (shipsgo)', () => {
  it('uses scac as both id and code', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.id).toBe('MSCU')
    expect(result.code).toBe('MSCU')
  })

  it('maps name', () => {
    expect(transformCarrier(makeCarrier()).name).toBe('MSC')
  })

  it('maps isActive: ACTIVE → true, PASSIVE → false', () => {
    expect(transformCarrier(makeCarrier({ status: 'ACTIVE' })).isActive).toBe(true)
    expect(transformCarrier(makeCarrier({ status: 'PASSIVE' })).isActive).toBe(false)
  })

  it('builds trackingUrlTemplate containing the scac code', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.trackingUrlTemplate).toContain('MSCU')
    expect(result.trackingUrlTemplate).toContain('{trackingNumber}')
  })

  it('trackingUrlTemplate is undefined when scac is null', () => {
    expect(transformCarrier(makeCarrier({ scac: null })).trackingUrlTemplate).toBeUndefined()
  })

  it('id and code are undefined when scac is null', () => {
    const result = transformCarrier(makeCarrier({ scac: null }))
    expect(result.id).toBeUndefined()
    expect(result.code).toBeUndefined()
  })

  it('passes CarrierSchema.parse without throwing', () => {
    expect(() => CarrierSchema.parse(transformCarrier(makeCarrier()))).not.toThrow()
  })

  it('sets metadata to raw input', () => {
    const raw = makeCarrier()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })
})
