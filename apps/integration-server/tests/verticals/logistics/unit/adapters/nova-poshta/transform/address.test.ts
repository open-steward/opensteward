import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  type NovaPoshtaAddress,
} from '../../../../../../../src/verticals/logistics/adapters/nova-poshta/transform/address'

function makeAddress(overrides: Partial<NovaPoshtaAddress> = {}): NovaPoshtaAddress {
  return {
    name: 'John',
    fullName: 'John Doe',
    companyName: 'Acme Corp',
    phone: '+380441234567',
    email: 'john@example.com',
    street: 'Khreschatyk Street',
    streetNumber: '22',
    flat: '5',
    city: 'Kyiv',
    settlement: undefined,
    region: 'Kyiv Oblast',
    postalCode: '01001',
    countryCode: 'UA',
    ...overrides,
  }
}

describe('nova-poshta transformAddress', () => {
  it('prefers fullName over name', () => {
    expect(transformAddress(makeAddress()).name).toBe('John Doe')
  })

  it('falls back to name when fullName is absent', () => {
    expect(transformAddress(makeAddress({ fullName: undefined })).name).toBe('John')
  })

  it('maps company from companyName', () => {
    expect(transformAddress(makeAddress()).company).toBe('Acme Corp')
  })

  it('concatenates street and streetNumber into street1', () => {
    expect(transformAddress(makeAddress()).street1).toBe('Khreschatyk Street 22')
  })

  it('maps street1 from street alone when streetNumber is absent', () => {
    expect(transformAddress(makeAddress({ streetNumber: undefined })).street1).toBe(
      'Khreschatyk Street',
    )
  })

  it('omits street1 when street is absent', () => {
    expect(transformAddress(makeAddress({ street: undefined })).street1).toBeUndefined()
  })

  it('maps street2 as "Apt <flat>" when flat is present', () => {
    expect(transformAddress(makeAddress()).street2).toBe('Apt 5')
  })

  it('omits street2 when flat is absent', () => {
    expect(transformAddress(makeAddress({ flat: undefined })).street2).toBeUndefined()
  })

  it('maps city from city field', () => {
    expect(transformAddress(makeAddress()).city).toBe('Kyiv')
  })

  it('falls back city to settlement when city is absent', () => {
    expect(transformAddress(makeAddress({ city: undefined, settlement: 'Boryspil' })).city).toBe(
      'Boryspil',
    )
  })

  it('maps state from region', () => {
    expect(transformAddress(makeAddress()).state).toBe('Kyiv Oblast')
  })

  it('maps postalCode', () => {
    expect(transformAddress(makeAddress()).postalCode).toBe('01001')
  })

  it('maps country from countryCode', () => {
    expect(transformAddress(makeAddress()).country).toBe('UA')
  })

  it('maps phone', () => {
    expect(transformAddress(makeAddress()).phone).toBe('+380441234567')
  })

  it('maps email', () => {
    expect(transformAddress(makeAddress()).email).toBe('john@example.com')
  })
})
