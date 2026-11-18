import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawRevelEstablishment,
} from '../../../../../../../src/verticals/ecommerce/adapters/revel/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeEstablishment(overrides: Partial<RawRevelEstablishment> = {}): RawRevelEstablishment {
  return {
    id: 1,
    name: 'Downtown Cafe',
    address: '123 Main St',
    city: 'Portland',
    state: 'OR',
    zipcode: '97201',
    country: 'US',
    phone: '503-555-1234',
    active: true,
    ...overrides,
  }
}

describe('transformLocation (Revel)', () => {
  it('maps core fields', () => {
    const result = transformLocation(makeEstablishment())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Downtown Cafe')
    expect(result.active).toBe(true)
    expect(result.phone).toBe('503-555-1234')
  })

  it('maps address fields', () => {
    const result = transformLocation(makeEstablishment())
    expect(result.address).toEqual({
      line1: '123 Main St',
      city: 'Portland',
      region: 'OR',
      postalCode: '97201',
      country: 'US',
    })
  })

  it('returns undefined address when all address fields are missing', () => {
    const result = transformLocation(makeEstablishment({
      address: undefined,
      city: undefined,
      state: undefined,
      zipcode: undefined,
      country: undefined,
    }))
    expect(result.address).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeEstablishment()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = transformLocation(makeEstablishment())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })

  it('handles minimal establishment', () => {
    const result = transformLocation({ id: 99 })
    expect(result.id).toBe('99')
    expect(result.name).toBe('')
    expect(result.active).toBe(true)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

/**
 * The row general_suite.yaml (2025.3.0) documents for GET
 * /enterprise/Establishment/: `address` is "URI of an Address resource where
 * the location address is defined" (example "/enterprise/Address/2009/"), and
 * the row has no city, state, zipcode or country of its own.
 */
describe('transformLocation (Revel), the documented Establishment row', () => {
  const documented: RawRevelEstablishment = {
    id: 1731,
    name: 'APIdoc Example',
    active: true,
    address: '/enterprise/Address/2009/',
    phone: '415-744-1433',
    email: 'apisupport@revelsystems.com',
    time_zone: 'US/Pacific',
    resource_uri: '/enterprise/Establishment/1731/',
    created_date: '2019-03-15T03:06:24.366099',
    updated_date: '2019-08-18T13:44:25.346811',
  }

  it('maps the documented example onto a valid Location', () => {
    const result = transformLocation(documented)
    expect(result).toMatchObject({ id: '1731', name: 'APIdoc Example', active: true, phone: '415-744-1433' })
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })

  it('does not pass the Address resource URI off as a street line', () => {
    expect(transformLocation(documented).address).toBeUndefined()
    // The URI stays reachable in metadata.
    expect(transformLocation(documented).metadata['address']).toBe('/enterprise/Address/2009/')
  })

  it('keeps address fields that are not a resource URI', () => {
    expect(transformLocation({ ...documented, address: '123 Main St', city: 'Portland' }).address).toEqual({
      line1: '123 Main St',
      city: 'Portland',
      region: undefined,
      postalCode: undefined,
      country: undefined,
    })
    expect(transformLocation({ ...documented, city: 'Portland' }).address).toMatchObject({
      line1: undefined,
      city: 'Portland',
    })
  })
})
