import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  type KarrioAddress,
} from '../../../../../../../src/verticals/logistics/adapters/karrio/transform/address'

function makeRaw(overrides: Partial<KarrioAddress> = {}): KarrioAddress {
  return {
    person_name: 'Alice',
    company_name: 'Acme Corp',
    address_line1: '123 Main St',
    address_line2: 'Suite 100',
    city: 'New York',
    state_code: 'NY',
    postal_code: '10001',
    country_code: 'US',
    phone_number: '+12125550001',
    email: 'alice@example.com',
    ...overrides,
  }
}

describe('karrio transformAddress', () => {
  it('maps person_name to name', () => {
    expect(transformAddress(makeRaw()).name).toBe('Alice')
  })

  it('maps company_name to company', () => {
    expect(transformAddress(makeRaw()).company).toBe('Acme Corp')
  })

  it('maps address_line1 to street1', () => {
    expect(transformAddress(makeRaw()).street1).toBe('123 Main St')
  })

  it('maps address_line2 to street2', () => {
    expect(transformAddress(makeRaw()).street2).toBe('Suite 100')
  })

  it('maps city', () => {
    expect(transformAddress(makeRaw()).city).toBe('New York')
  })

  it('maps state_code to state', () => {
    expect(transformAddress(makeRaw()).state).toBe('NY')
  })

  it('maps postal_code to postalCode', () => {
    expect(transformAddress(makeRaw()).postalCode).toBe('10001')
  })

  it('maps country_code to country', () => {
    expect(transformAddress(makeRaw()).country).toBe('US')
  })

  it('maps phone_number to phone', () => {
    expect(transformAddress(makeRaw()).phone).toBe('+12125550001')
  })

  it('maps email', () => {
    expect(transformAddress(makeRaw()).email).toBe('alice@example.com')
  })

  it('a documented but unassigned country code ("AC", the documented example) is omitted', () => {
    expect(transformAddress(makeRaw({ country_code: 'AC' })).country).toBeUndefined()
    expect(transformAddress(makeRaw({ country_code: 'AN' })).country).toBeUndefined()
  })

  it('all nulls produce undefined fields', () => {
    const r = transformAddress({
      person_name: null,
      company_name: null,
      address_line1: null,
      city: null,
      state_code: null,
      postal_code: null,
      country_code: null,
    })
    expect(r.name).toBeUndefined()
    expect(r.city).toBeUndefined()
    expect(r.country).toBeUndefined()
  })
})
