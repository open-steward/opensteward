import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  type IMileAddress,
} from '../../../../../../../src/verticals/logistics/adapters/imile/transform/address'

function makeAddress(overrides: Partial<IMileAddress> = {}): IMileAddress {
  return {
    name: 'Jane Doe',
    companyName: 'Acme Co',
    addressLine1: '123 Main St',
    addressLine2: 'Suite 4',
    city: 'Dubai',
    state: 'Dubai',
    postalCode: '00000',
    countryCode: 'AE',
    phone: '+971501234567',
    email: 'jane@acme.example',
    ...overrides,
  }
}

describe('imile transformAddress', () => {
  it('maps name from name field', () => {
    expect(transformAddress(makeAddress()).name).toBe('Jane Doe')
  })

  it('maps company from companyName', () => {
    expect(transformAddress(makeAddress()).company).toBe('Acme Co')
  })

  it('maps street1 from addressLine1', () => {
    expect(transformAddress(makeAddress()).street1).toBe('123 Main St')
  })

  it('maps street2 from addressLine2', () => {
    expect(transformAddress(makeAddress()).street2).toBe('Suite 4')
  })

  it('maps city, state, postalCode, country, phone, email', () => {
    const result = transformAddress(makeAddress())
    expect(result.city).toBe('Dubai')
    expect(result.state).toBe('Dubai')
    expect(result.postalCode).toBe('00000')
    expect(result.country).toBe('AE')
    expect(result.phone).toBe('+971501234567')
    expect(result.email).toBe('jane@acme.example')
  })

  it('converts null fields to undefined', () => {
    const result = transformAddress(makeAddress({ companyName: null, addressLine2: null }))
    expect(result.company).toBeUndefined()
    expect(result.street2).toBeUndefined()
  })

  it('handles fully empty address', () => {
    const result = transformAddress({})
    expect(result.name).toBeUndefined()
    expect(result.city).toBeUndefined()
  })
})
