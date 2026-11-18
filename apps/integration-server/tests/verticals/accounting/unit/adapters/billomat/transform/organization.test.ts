import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type BillomatOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/billomat/transform/organization'

function makeOrganization(overrides: Partial<BillomatOrganization> = {}): BillomatOrganization {
  return {
    id: 'org-001',
    company_name: 'Mustermann GmbH',
    legal_name: 'Mustermann GmbH & Co. KG',
    tax_number: 'DE123456789',
    currency_code: 'EUR',
    street: 'Berliner Str. 10',
    city: 'Berlin',
    zip: '10115',
    country_code: 'DE',
    phone: '+49 30 12345678',
    url: 'https://mustermann.de',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id from raw id', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-001')
  })

  it('maps company_name to name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Mustermann GmbH')
  })

  it('maps legal_name to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Mustermann GmbH & Co. KG')
  })

  it('falls back to company_name for legalName when legal_name is empty', () => {
    expect(transformOrganization(makeOrganization({ legal_name: '' })).legalName).toBe('Mustermann GmbH')
  })

  it('maps tax_number to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('DE123456789')
  })

  it('maps currency_code to currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('EUR')
  })

  it('maps url to website', () => {
    expect(transformOrganization(makeOrganization()).website).toBe('https://mustermann.de')
  })

  it('maps address fields', () => {
    const o = transformOrganization(makeOrganization())
    expect(o.address?.address1).toBe('Berliner Str. 10')
    expect(o.address?.city).toBe('Berlin')
    expect(o.address?.postalCode).toBe('10115')
    expect(o.address?.country).toBe('DE')
  })

  it('returns undefined website when url is empty', () => {
    expect(transformOrganization(makeOrganization({ url: '' })).website).toBeUndefined()
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
