import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  transformDocAddress,
  type ShippyProAddress,
} from '../../../../../../../src/verticals/logistics/adapters/shippypro/transform/address'
import { AddressSchema } from '../../../../../../../src/verticals/logistics/schema/shared'

function makeAddress(overrides: Partial<ShippyProAddress> = {}): ShippyProAddress {
  return {
    Name: 'Alice Walker',
    Company: 'Acme Corp',
    Street1: '100 Commerce Rd',
    Street2: 'Suite 5',
    City: 'New York',
    State: 'NY',
    Zip: '10001',
    Country: 'US',
    Phone: '+12125550100',
    Email: 'alice@acme.example',
    ...overrides,
  }
}

describe('transformAddress (shippypro)', () => {
  it('maps PascalCase Name → name and Company → company', () => {
    const result = transformAddress(makeAddress())
    expect(result.name).toBe('Alice Walker')
    expect(result.company).toBe('Acme Corp')
  })

  it('maps Street1/Street2 → street1/street2', () => {
    const result = transformAddress(makeAddress())
    expect(result.street1).toBe('100 Commerce Rd')
    expect(result.street2).toBe('Suite 5')
  })

  it('maps City, State, Zip and Country', () => {
    const result = transformAddress(makeAddress())
    expect(result.city).toBe('New York')
    expect(result.state).toBe('NY')
    expect(result.postalCode).toBe('10001')
    expect(result.country).toBe('US')
  })

  it('maps Phone and Email', () => {
    const result = transformAddress(makeAddress())
    expect(result.phone).toBe('+12125550100')
    expect(result.email).toBe('alice@acme.example')
  })

  it('maps null fields to undefined', () => {
    const result = transformAddress(makeAddress({ Name: null, Street2: null }))
    expect(result.name).toBeUndefined()
    expect(result.street2).toBeUndefined()
  })

  it('handles entirely empty object', () => {
    const result = transformAddress({})
    expect(result.name).toBeUndefined()
    expect(result.city).toBeUndefined()
  })
})

// Fixture: the documented v1 `Address` example (https://api.shippypro.com/docs/v1.json):
// name "John Doe", company "", street1 "123 Main St", street2 "", city "Park City",
// state "UT", zip "84060", country "US", phone "5551231234", email "johndoe@gmail.com".
describe('transformDocAddress (shippypro documented Address)', () => {
  const DOC = {
    name: 'John Doe',
    company: '',
    street1: '123 Main St',
    street2: '',
    city: 'Park City',
    state: 'UT',
    zip: '84060',
    country: 'US',
    phone: '5551231234',
    email: 'johndoe@gmail.com',
  }

  it('maps the documented lowercase fields, zip to postalCode, and drops empty strings', () => {
    expect(AddressSchema.parse(transformDocAddress(DOC))).toEqual({
      name: 'John Doe',
      street1: '123 Main St',
      city: 'Park City',
      state: 'UT',
      postalCode: '84060',
      country: 'US',
      phone: '5551231234',
      email: 'johndoe@gmail.com',
    })
  })

  it('omits a country that is not a two-letter code rather than guessing', () => {
    expect(transformDocAddress({ ...DOC, country: 'Italy' }).country).toBeUndefined()
    expect(transformDocAddress({ ...DOC, country: 'it' }).country).toBe('IT')
  })
})
