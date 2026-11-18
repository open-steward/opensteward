import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  type CdekLocation,
  type CdekContact,
} from '../../../../../../../src/verticals/logistics/adapters/cdek/transform/address'
import { AddressSchema } from '../../../../../../../src/verticals/logistics/schema/shared'

function makeLocation(overrides: Partial<CdekLocation> = {}): CdekLocation {
  return {
    city: 'Moscow',
    address: 'Lenina 1',
    country_code: 'RU',
    region: 'Moscow Region',
    postal_code: '101000',
    ...overrides,
  }
}

function makeContact(overrides: Partial<CdekContact> = {}): CdekContact {
  return {
    name: 'Ivan Ivanov',
    company: 'Acme LLC',
    email: 'ivan@example.ru',
    phones: [{ number: '+79001234567' }],
    ...overrides,
  }
}

describe('cdek transformAddress', () => {
  it('maps contact name to name', () => {
    expect(transformAddress(makeLocation(), makeContact())?.name).toBe('Ivan Ivanov')
  })

  it('maps contact company to company', () => {
    expect(transformAddress(makeLocation(), makeContact())?.company).toBe('Acme LLC')
  })

  it('maps location address to street1', () => {
    expect(transformAddress(makeLocation(), makeContact())?.street1).toBe('Lenina 1')
  })

  it('maps location city to city', () => {
    expect(transformAddress(makeLocation(), makeContact())?.city).toBe('Moscow')
  })

  it('maps location region to state', () => {
    expect(transformAddress(makeLocation(), makeContact())?.state).toBe('Moscow Region')
  })

  it('maps postal_code to postalCode', () => {
    expect(transformAddress(makeLocation(), makeContact())?.postalCode).toBe('101000')
  })

  it('maps country_code to country', () => {
    expect(transformAddress(makeLocation(), makeContact())?.country).toBe('RU')
  })

  it('maps first phone number to phone', () => {
    expect(transformAddress(makeLocation(), makeContact())?.phone).toBe('+79001234567')
  })

  it('maps contact email to email', () => {
    expect(transformAddress(makeLocation(), makeContact())?.email).toBe('ivan@example.ru')
  })

  it('returns undefined when both location and contact are null/undefined', () => {
    expect(transformAddress(null, null)).toBeUndefined()
  })

  it('produces output that satisfies AddressSchema when country_code is valid', () => {
    const result = transformAddress(makeLocation({ country_code: 'RU' }), makeContact())
    expect(() => AddressSchema.parse(result)).not.toThrow()
  })

  it('works with only location (no contact)', () => {
    const result = transformAddress(makeLocation())
    expect(result?.city).toBe('Moscow')
    expect(result?.name).toBeUndefined()
  })

  it('falls back to address_full when address is absent', () => {
    const result = transformAddress(
      makeLocation({ address: null, address_full: '101000, Moscow, Lenina 1' }),
    )
    expect(result?.street1).toBe('101000, Moscow, Lenina 1')
  })
})
