import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawSpiroCompany,
} from '../../../../../../../src/verticals/crm/adapters/spiro/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { COMPANIES_LIST, COMPANY_GET } from '../fixtures'

const LISTED: RawSpiroCompany = COMPANIES_LIST.data[0]

describe('spiro transformCompany (documented GET /api/v1/companies example)', () => {
  it('parses against CompanySchema with every documented field in place', () => {
    const c = CompanySchema.parse(transformCompany(LISTED))
    expect(c).toMatchObject({
      id: '432',
      name: 'West-Schuster',
      domain: 'parisian.test',
      phone: '1-237-139-3783 x372',
      owner_id: '990',
      address: {
        line1: '59433 Lucina Greens',
        city: 'North Glindabury',
        region: 'Kansas',
        postalCode: '36791-9251',
      },
      created_at: '2026-09-01T09:57:38.304Z',
      updated_at: '2026-09-01T09:57:38.304Z',
    })
    expect(c.metadata).toEqual(LISTED)
  })

  it('keeps the country name out of the ISO alpha-2 address.country', () => {
    expect(transformCompany(LISTED).address?.country).toBeUndefined()
  })

  it('reads the GET-by-id document the same way', () => {
    const c = CompanySchema.parse(transformCompany(COMPANY_GET.data))
    expect(c.id).toBe('434')
    expect(c.name).toBe('Hagenes, Towne and Hauck')
  })

  it('sends no address when Spiro has none', () => {
    const c = transformCompany({
      ...LISTED,
      attributes: { ...LISTED.attributes, address: null, city: null, state: null, zipcode: null },
    })
    CompanySchema.parse(c)
    expect(c.address).toBeUndefined()
  })
})

describe('spiro untransformCompany', () => {
  it('maps domain back to website', () => {
    const result = untransformCompany({ domain: 'acme.com' })
    expect(result.website).toBe('acme.com')
  })

  it('maps size back to employee_count', () => {
    const result = untransformCompany({ size: 250 })
    expect(result.employee_count).toBe(250)
  })

  it('maps name back to name', () => {
    const result = untransformCompany({ name: 'Acme' })
    expect(result.name).toBe('Acme')
  })

  it('omits undefined fields', () => {
    const result = untransformCompany({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
