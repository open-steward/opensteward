import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type AkauntingOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/akaunting/transform/organization'

function makeOrganization(overrides: Partial<AkauntingOrganization> = {}): AkauntingOrganization {
  return {
    id: 1,
    name: 'Acme GmbH',
    email: 'info@acme.de',
    tax_number: 'DE123456789',
    currency: 'EUR',
    address: 'Hauptstrasse 10',
    city: 'Berlin',
    zip_code: '10115',
    state: 'Berlin',
    country: 'DE',
    phone: '+49 30 12345678',
    domain: 'https://acme.de',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id from raw id as string', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('1')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Acme GmbH')
  })

  it('maps name to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Acme GmbH')
  })

  it('maps tax_number to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('DE123456789')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('EUR')
  })

  it('maps domain to website', () => {
    expect(transformOrganization(makeOrganization()).website).toBe('https://acme.de')
  })

  it('maps address fields', () => {
    const o = transformOrganization(makeOrganization())
    expect(o.address?.address1).toBe('Hauptstrasse 10')
    expect(o.address?.city).toBe('Berlin')
    expect(o.address?.postalCode).toBe('10115')
    expect(o.address?.region).toBe('Berlin')
    expect(o.address?.country).toBe('DE')
  })

  it('returns undefined website when domain is empty', () => {
    expect(transformOrganization(makeOrganization({ domain: '' })).website).toBeUndefined()
  })

  it('returns undefined taxNumber when tax_number is empty', () => {
    expect(transformOrganization(makeOrganization({ tax_number: '' })).taxNumber).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
