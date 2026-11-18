import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  type GigAddress,
} from '../../../../../../../src/verticals/logistics/adapters/gig-logistics/transform/address'
import { AddressSchema } from '../../../../../../../src/verticals/logistics/schema/shared'

function makeAddress(overrides: Partial<GigAddress> = {}): GigAddress {
  return {
    name: 'Alice Sender',
    companyName: 'Acme NG Ltd',
    phoneNumber: '+2348001234567',
    email: 'alice@example.com',
    address: '5 Lagos Road',
    addressLine2: 'Flat 3',
    city: 'Lagos',
    state: 'LA',
    country: 'NG',
    postalCode: '100001',
    ...overrides,
  }
}

describe('gig-logistics transformAddress', () => {
  it('maps name', () => {
    expect(transformAddress(makeAddress()).name).toBe('Alice Sender')
  })

  it('maps companyName as company', () => {
    expect(transformAddress(makeAddress()).company).toBe('Acme NG Ltd')
  })

  it('maps address as street1', () => {
    expect(transformAddress(makeAddress()).street1).toBe('5 Lagos Road')
  })

  it('maps addressLine2 as street2', () => {
    expect(transformAddress(makeAddress()).street2).toBe('Flat 3')
  })

  it('maps city', () => {
    expect(transformAddress(makeAddress()).city).toBe('Lagos')
  })

  it('maps state', () => {
    expect(transformAddress(makeAddress()).state).toBe('LA')
  })

  it('maps country', () => {
    expect(transformAddress(makeAddress()).country).toBe('NG')
  })

  it('maps postalCode', () => {
    expect(transformAddress(makeAddress()).postalCode).toBe('100001')
  })

  it('maps phoneNumber as phone', () => {
    expect(transformAddress(makeAddress()).phone).toBe('+2348001234567')
  })

  it('maps email', () => {
    expect(transformAddress(makeAddress()).email).toBe('alice@example.com')
  })

  it('handles null optional fields gracefully', () => {
    const result = transformAddress(
      makeAddress({ companyName: null, addressLine2: null, postalCode: null }),
    )
    expect(result.company).toBeUndefined()
    expect(result.street2).toBeUndefined()
    expect(result.postalCode).toBeUndefined()
  })

  it('passes AddressSchema validation', () => {
    expect(() => AddressSchema.parse(transformAddress(makeAddress()))).not.toThrow()
  })
})
