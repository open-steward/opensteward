import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  type ShipEngineAddress,
} from '../../../../../../../src/verticals/logistics/adapters/shipengine/transform/address'
import { AddressSchema } from '../../../../../../../src/verticals/logistics/schema/shared'

function makeAddress(overrides: Partial<ShipEngineAddress> = {}): ShipEngineAddress {
  return {
    name: 'Jane Doe',
    company_name: 'Acme Inc',
    address_line1: '2500 Market Street',
    address_line2: 'Suite 300',
    city_locality: 'San Francisco',
    state_province: 'CA',
    postal_code: '94114',
    country_code: 'US',
    phone: '+14155550123',
    email: 'jane.doe@acme.example',
    ...overrides,
  }
}

describe('transformAddress (shipengine)', () => {
  it('maps name from name field', () => {
    expect(transformAddress(makeAddress()).name).toBe('Jane Doe')
  })

  it('maps company from company_name', () => {
    expect(transformAddress(makeAddress()).company).toBe('Acme Inc')
  })

  it('maps street1 from address_line1', () => {
    expect(transformAddress(makeAddress()).street1).toBe('2500 Market Street')
  })

  it('maps street2 from address_line2', () => {
    expect(transformAddress(makeAddress()).street2).toBe('Suite 300')
  })

  it('maps city from city_locality', () => {
    expect(transformAddress(makeAddress()).city).toBe('San Francisco')
  })

  it('maps state from state_province', () => {
    expect(transformAddress(makeAddress()).state).toBe('CA')
  })

  it('maps postalCode from postal_code', () => {
    expect(transformAddress(makeAddress()).postalCode).toBe('94114')
  })

  it('maps country from country_code', () => {
    expect(transformAddress(makeAddress()).country).toBe('US')
  })

  it('maps phone and email', () => {
    const result = transformAddress(makeAddress())
    expect(result.phone).toBe('+14155550123')
    expect(result.email).toBe('jane.doe@acme.example')
  })

  it('falls back street2 to address_line3 when line2 absent', () => {
    const result = transformAddress(makeAddress({ address_line2: null, address_line3: 'Floor 4' }))
    expect(result.street2).toBe('Floor 4')
  })

  it('handles all null optional fields gracefully', () => {
    const result = transformAddress({})
    expect(result.name).toBeUndefined()
    expect(result.street1).toBeUndefined()
    expect(result.country).toBeUndefined()
  })

  it('passes AddressSchema.parse without throwing', () => {
    const result = transformAddress(makeAddress())
    expect(() => AddressSchema.parse(result)).not.toThrow()
  })
})
