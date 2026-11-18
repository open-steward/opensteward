/**
 * Fixture from the documented Company definition
 * (http://static.lime-crm.com/crm-api-docs/spec/limeobject): `name`, `phone`
 * ("title: Telephone"), `www` ("title: Homepage"), plus the system
 * properties `_id`, `_createdtime` and `_timestamp`.
 */
import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  type RawLimeCrmCompany,
} from '../../../../../../../src/verticals/crm/adapters/lime-crm/transform/company'

const raw: RawLimeCrmCompany = {
  _id: 1001,
  _createdtime: '2024-01-15T09:00:00Z',
  _timestamp: '2024-02-01T10:30:00Z',
  name: 'Nordic Ventures AB',
  phone: '+46812345678',
  www: 'https://nordic.se',
}

describe('lime-crm transformCompany', () => {
  it('maps the documented fields', () => {
    const company = CompanySchema.parse(transformCompany(raw))
    expect(company.id).toBe('1001')
    expect(company.name).toBe('Nordic Ventures AB')
    expect(company.phone).toBe('+46812345678')
    expect(company.domain).toBe('nordic.se')
    expect(company.created_at).toBe('2024-01-15T09:00:00.000Z')
    expect(company.updated_at).toBe('2024-02-01T10:30:00.000Z')
    expect(company.metadata).toEqual(raw)
  })

  it.each([
    ['https://www.Nordic.se/about', 'www.nordic.se'],
    ['nordic.se', 'nordic.se'],
    ['not a homepage', undefined],
    ['nordic', undefined],
    ['', undefined],
  ])('domain of homepage %j is %j', (www, domain) => {
    const company = CompanySchema.parse(transformCompany({ ...raw, www }))
    expect(company.domain).toBe(domain)
    expect(company.metadata['www']).toBe(www)
  })

  it('a company without _id is an error, not the id "undefined"', () => {
    expect(() => transformCompany({ name: 'X' } as unknown as RawLimeCrmCompany)).toThrow(/_id/)
  })
})
