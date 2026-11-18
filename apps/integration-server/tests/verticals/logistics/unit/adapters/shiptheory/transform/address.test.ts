import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  type ShiptheoryAddress,
} from '../../../../../../../src/verticals/logistics/adapters/shiptheory/transform/address'

describe('Shiptheory transformAddress', () => {
  const raw: ShiptheoryAddress = {
    firstname: 'Jane',
    lastname: 'Doe',
    company: 'Acme Ltd',
    address_line_1: '10 Downing St',
    address_line_2: 'Floor 2',
    city: 'London',
    county: 'Greater London',
    postcode: 'SW1A 2AA',
    country: 'GB',
    telephone: '+441234567890',
    email: 'jane@acme.example',
  }

  it('concatenates firstname and lastname into name', () => {
    const result = transformAddress(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('maps address_line_1 to street1 and county to state', () => {
    const result = transformAddress(raw)
    expect(result.street1).toBe('10 Downing St')
    expect(result.state).toBe('Greater London')
  })

  it('maps postcode to postalCode and country to country', () => {
    const result = transformAddress(raw)
    expect(result.postalCode).toBe('SW1A 2AA')
    expect(result.country).toBe('GB')
  })

  it('maps telephone to phone and email to email', () => {
    const result = transformAddress(raw)
    expect(result.phone).toBe('+441234567890')
    expect(result.email).toBe('jane@acme.example')
  })

  it('produces undefined name when both firstname and lastname are absent', () => {
    const result = transformAddress({ address_line_1: '1 Main St' })
    expect(result.name).toBeUndefined()
  })

  it('produces only firstname when lastname is null', () => {
    const result = transformAddress({ firstname: 'Solo', lastname: null })
    expect(result.name).toBe('Solo')
  })

  it('maps undefined optional fields to undefined', () => {
    const result = transformAddress({})
    expect(result.street1).toBeUndefined()
    expect(result.city).toBeUndefined()
    expect(result.company).toBeUndefined()
  })
})
