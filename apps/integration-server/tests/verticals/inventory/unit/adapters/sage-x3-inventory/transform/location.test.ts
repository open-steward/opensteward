import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawSageX3Location,
} from '../../../../../../../src/verticals/inventory/adapters/sage-x3-inventory/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('sage-x3-inventory transformLocation', () => {
  const rawSite: RawSageX3Location = {
    FCY: 'PARIS',
    LOCDES: 'Paris Warehouse',
    ENAFLG: '2',
    CREDAT: '2024-03-01T00:00:00Z',
  }

  const rawBin: RawSageX3Location = {
    FCY: 'PARIS',
    LOC: 'A-01-01',
    LOCDES: 'Aisle A Rack 1 Bin 1',
    LOCTYP: 'RACK',
    ENAFLG: '2',
  }

  it('site-level: id equals FCY when LOC is absent', () => {
    const result = transformLocation(rawSite)
    expect(result.id).toBe('PARIS')
  })

  it('site-level: type is warehouse', () => {
    const result = transformLocation(rawSite)
    expect(result.type).toBe('warehouse')
  })

  it('site-level: isActive true when ENAFLG is "2"', () => {
    const result = transformLocation(rawSite)
    expect(result.isActive).toBe(true)
  })

  it('site-level: isActive false when ENAFLG is "1"', () => {
    const result = transformLocation({ ...rawSite, ENAFLG: '1' })
    expect(result.isActive).toBe(false)
  })

  it('site-level: name comes from LOCDES', () => {
    const result = transformLocation(rawSite)
    expect(result.name).toBe('Paris Warehouse')
  })

  it('site-level: platform is sage-x3-inventory', () => {
    const result = transformLocation(rawSite)
    expect(result.platform).toBe('sage-x3-inventory')
  })

  it('bin-level: id is composite FCY:LOC', () => {
    const result = transformLocation(rawBin)
    expect(result.id).toBe('PARIS:A-01-01')
  })

  it('bin-level: parentLocationId equals FCY', () => {
    const result = transformLocation(rawBin)
    expect(result.parentLocationId).toBe('PARIS')
  })

  it('LOCTYP TRANSIT maps to transit type', () => {
    const result = transformLocation({ ...rawBin, LOCTYP: 'TRANSIT' })
    expect(result.type).toBe('transit')
  })

  it('site-level produces output satisfying LocationSchema', () => {
    const result = transformLocation(rawSite)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })

  it('bin-level produces output satisfying LocationSchema', () => {
    const result = transformLocation(rawBin)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
