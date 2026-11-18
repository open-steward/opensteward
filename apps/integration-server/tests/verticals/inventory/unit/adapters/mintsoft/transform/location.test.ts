import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawMintsoftWarehouse,
} from '../../../../../../../src/verticals/inventory/adapters/mintsoft/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('mintsoft transformLocation', () => {
  const raw: RawMintsoftWarehouse = {
    ID: 7,
    Name: 'London Warehouse',
    Code: 'LDN',
    Active: true,
    AddressLine1: '1 Commerce Way',
    AddressLine2: 'Unit 5',
    City: 'London',
    County: 'Greater London',
    PostCode: 'E1 6AN',
    CountryId: 1,
  }

  it('maps id and externalId from ID as string', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
  })

  it('maps name from Name field', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('London Warehouse')
  })

  it('maps code from Code field', () => {
    const result = transformLocation(raw)
    expect(result.code).toBe('LDN')
  })

  it('sets type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('maps isActive from Active field', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when Active is false', () => {
    const result = transformLocation({ ...raw, Active: false })
    expect(result.isActive).toBe(false)
  })

  it('maps address fields', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('1 Commerce Way')
    expect(result.address?.city).toBe('London')
    expect(result.address?.postalCode).toBe('E1 6AN')
  })

  it('leaves address undefined when no address fields provided', () => {
    const result = transformLocation({ ID: 8, Name: 'Empty', Active: true })
    expect(result.address).toBeUndefined()
  })

  it('throws rather than guess isActive when Active is absent', () => {
    const { Active: _omit, ...rest } = raw
    expect(() => transformLocation(rest as RawMintsoftWarehouse)).toThrow(/Active/)
  })

  it('throws rather than serve an empty name when Name is absent', () => {
    const { Name: _omit, ...rest } = raw
    expect(() => transformLocation(rest as RawMintsoftWarehouse)).toThrow(/Name/)
  })

  it('sets platform to mintsoft', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('mintsoft')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
