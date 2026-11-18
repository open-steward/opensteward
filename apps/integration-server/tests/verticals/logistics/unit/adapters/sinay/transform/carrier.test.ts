import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type SinalySealine,
} from '../../../../../../../src/verticals/logistics/adapters/sinay/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

function makeSealine(overrides: Partial<SinalySealine> = {}): SinalySealine {
  return {
    name: 'Maersk',
    active: true,
    maintenance: false,
    activeTypes: { CT: true, BL: true, BK: false },
    scacCodes: ['MAEU', 'MAEI'],
    prefixes: ['MSKU', 'MRKU'],
    ...overrides,
  }
}

describe('Sinay transformCarrier', () => {
  it('uses first SCAC code as id', () => {
    const result = transformCarrier(makeSealine())
    expect(result.id).toBe('MAEU')
  })

  it('uses first SCAC code as code', () => {
    const result = transformCarrier(makeSealine())
    expect(result.code).toBe('MAEU')
  })

  it('maps name field to name', () => {
    const result = transformCarrier(makeSealine())
    expect(result.name).toBe('Maersk')
  })

  it('sets isActive true when active=true and maintenance=false', () => {
    const result = transformCarrier(makeSealine())
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when maintenance=true even if active=true', () => {
    const result = transformCarrier(makeSealine({ maintenance: true }))
    expect(result.isActive).toBe(false)
  })

  it('sets isActive false when active=false', () => {
    const result = transformCarrier(makeSealine({ active: false }))
    expect(result.isActive).toBe(false)
  })

  it('passes CarrierSchema validation', () => {
    const result = transformCarrier(makeSealine())
    expect(() => CarrierSchema.parse(result)).not.toThrow()
  })

  it('falls back to name as id when scacCodes is empty', () => {
    const result = transformCarrier(makeSealine({ scacCodes: [] }))
    expect(result.id).toBe('Maersk')
    expect(result.code).toBeUndefined()
  })

  it('falls back to name as id when scacCodes is null', () => {
    const result = transformCarrier(makeSealine({ scacCodes: null }))
    expect(result.id).toBe('Maersk')
  })

  it('attaches raw as metadata', () => {
    const raw = makeSealine()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })
})
