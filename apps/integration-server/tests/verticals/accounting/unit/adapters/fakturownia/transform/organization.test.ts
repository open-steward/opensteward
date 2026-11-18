import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type FakturowniaAccount,
} from '../../../../../../../src/verticals/accounting/adapters/fakturownia/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<FakturowniaAccount> = {}): FakturowniaAccount {
  return {
    prefix: 'my-company',
    name: 'My Company sp. z o.o.',
    tax_no: 'PL1234567890',
    email: 'info@mycompany.pl',
    phone: '+48-22-555-0001',
    www: 'https://mycompany.pl',
    address: 'ul. Marszalkowska 1',
    city: 'Warsaw',
    post_code: '00-001',
    country: 'PL',
    currency: 'PLN',
    timezone: 'Europe/Warsaw',
    ...overrides,
  }
}

describe('fakturownia transformOrganization', () => {
  it('maps prefix to id', () => {
    const result = transformOrganization(makeRaw({ prefix: 'acme-corp' }))
    expect(result.id).toBe('acme-corp')
  })

  it('maps name to name and legalName', () => {
    const result = transformOrganization(makeRaw({ name: 'Firm LLC' }))
    expect(result.name).toBe('Firm LLC')
    expect(result.legalName).toBe('Firm LLC')
  })

  it('maps tax_no to taxNumber', () => {
    const result = transformOrganization(makeRaw({ tax_no: 'PL9876543210' }))
    expect(result.taxNumber).toBe('PL9876543210')
  })

  it('maps www to website', () => {
    const result = transformOrganization(makeRaw({ www: 'https://example.com' }))
    expect(result.website).toBe('https://example.com')
  })

  it('maps timezone', () => {
    const result = transformOrganization(makeRaw({ timezone: 'Europe/Warsaw' }))
    expect(result.timezone).toBe('Europe/Warsaw')
  })

  it('maps address to billingAddress address1', () => {
    const result = transformOrganization(makeRaw({ address: 'ul. Nowy Swiat 10' }))
    expect(result.address?.address1).toBe('ul. Nowy Swiat 10')
  })

  it('maps city', () => {
    const result = transformOrganization(makeRaw({ city: 'Krakow' }))
    expect(result.address?.city).toBe('Krakow')
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes OrganizationSchema.parse without throwing', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
