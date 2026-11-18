import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawEposNowLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/eposnow/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeLocation(overrides: Partial<RawEposNowLocation> = {}): RawEposNowLocation {
  return {
    Id: 1,
    Name: 'High Street Branch',
    AddressLine1: '42 High Street',
    AddressLine2: 'Unit 3',
    City: 'Manchester',
    County: 'Greater Manchester',
    PostCode: 'M1 1AA',
    Country: 'GB',
    PhoneNumber: '+44 161 555 0100',
    Active: true,
    ...overrides,
  }
}

describe('transformLocation (Epos Now)', () => {
  it('maps core fields', () => {
    const result = transformLocation(makeLocation())
    expect(result.id).toBe('1')
    expect(result.name).toBe('High Street Branch')
    expect(result.active).toBe(true)
  })

  it('maps address fields', () => {
    const result = transformLocation(makeLocation())
    expect(result.address?.line1).toBe('42 High Street')
    expect(result.address?.line2).toBe('Unit 3')
    expect(result.address?.city).toBe('Manchester')
    expect(result.address?.region).toBe('Greater Manchester')
    expect(result.address?.postalCode).toBe('M1 1AA')
    expect(result.address?.country).toBe('GB')
  })

  it('maps phone number', () => {
    const result = transformLocation(makeLocation())
    expect(result.phone).toBe('+44 161 555 0100')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeLocation()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = transformLocation(makeLocation())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })

  it('handles missing address gracefully', () => {
    const result = transformLocation(makeLocation({
      AddressLine1: undefined,
      City: undefined,
      PostCode: undefined,
      Country: undefined,
    }))
    expect(result.address).toBeUndefined()
  })

  it('defaults active to true when not specified', () => {
    const result = transformLocation(makeLocation({ Active: undefined }))
    expect(result.active).toBe(true)
  })
})
