import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  type InnoshipAddress,
} from '../../../../../../../src/verticals/logistics/adapters/innoship/transform/address'

function makeAddress(overrides: Partial<InnoshipAddress> = {}): InnoshipAddress {
  return {
    name: 'Warehouse Loc',
    contactPerson: 'Ion Popescu',
    phone: '+40721000001',
    email: 'ion@acme.ro',
    address1: 'Str. Victoriei 10',
    address2: 'Ap. 5',
    zipCode: '010001',
    city: 'Bucharest',
    county: 'Ilfov',
    countryCode: 'RO',
    companyName: 'Acme RO',
    ...overrides,
  }
}

describe('innoship transformAddress', () => {
  it('prefers contactPerson over name for the name field', () => {
    expect(transformAddress(makeAddress())?.name).toBe('Ion Popescu')
  })

  it('falls back to name when contactPerson is absent', () => {
    expect(transformAddress(makeAddress({ contactPerson: null }))?.name).toBe('Warehouse Loc')
  })

  it('maps company from companyName', () => {
    expect(transformAddress(makeAddress())?.company).toBe('Acme RO')
  })

  it('maps street1 from address1', () => {
    expect(transformAddress(makeAddress())?.street1).toBe('Str. Victoriei 10')
  })

  it('maps street2 from address2', () => {
    expect(transformAddress(makeAddress())?.street2).toBe('Ap. 5')
  })

  it('maps city, state (county), postalCode, country', () => {
    const result = transformAddress(makeAddress())
    expect(result?.city).toBe('Bucharest')
    expect(result?.state).toBe('Ilfov')
    expect(result?.postalCode).toBe('010001')
    expect(result?.country).toBe('RO')
  })

  it('maps phone and email', () => {
    const result = transformAddress(makeAddress())
    expect(result?.phone).toBe('+40721000001')
    expect(result?.email).toBe('ion@acme.ro')
  })

  it('returns undefined for null input', () => {
    expect(transformAddress(null)).toBeUndefined()
    expect(transformAddress(undefined)).toBeUndefined()
  })

  it('handles empty object', () => {
    const result = transformAddress({})
    expect(result).toBeDefined()
    expect(result?.name).toBeUndefined()
    expect(result?.city).toBeUndefined()
  })
})
