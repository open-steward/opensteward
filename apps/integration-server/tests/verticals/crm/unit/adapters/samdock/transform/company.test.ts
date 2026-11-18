import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawSamdockCompany,
} from '../../../../../../../src/verticals/crm/adapters/samdock/transform/company'

/**
 * Built from the `Organization` schema's documented examples
 * (https://samdock.readme.io/reference/organizationscontroller_browse.md).
 */
function documentedOrganization(overrides: Partial<RawSamdockCompany> = {}): RawSamdockCompany {
  return {
    _tenantID: '1',
    _id: '1',
    email: 'john.doe@abc.co',
    name: 'John Doe',
    phoneNumber: 'xxx-xxx-2323',
    faxNumber: 'xxx-xxx-2323',
    vatRegNo: '2324232-213321x',
    website: 'http://iIntcom.com',
    logo: 'http://iIntcom.com-.jpg',
    createdAt: '4/21/2021-14:21:02',
    address: { street: 'Street#3', number: 'H23', postcode: 'E01', city: 'Denver', country: 'US' },
    isCustomer: true,
    ...overrides,
  }
}

describe('samdock transformCompany', () => {
  it('maps the documented Organization fields and parses as a canonical Company', () => {
    const raw = documentedOrganization()
    const company = CompanySchema.parse(transformCompany(raw))
    expect(company).toMatchObject({
      id: '1',
      name: 'John Doe',
      phone: 'xxx-xxx-2323',
      domain: 'iintcom.com',
    })
    expect(company.created_at).toBeUndefined()
    expect(company.metadata).toEqual(raw)
  })

  it('keeps a createdAt in the documented date-time format', () => {
    const company = CompanySchema.parse(
      transformCompany(documentedOrganization({ createdAt: '2021-04-21T14:21:02Z' })),
    )
    expect(company.created_at).toBe('2021-04-21T14:21:02Z')
  })

  it('leaves domain empty when website is not a URL', () => {
    expect(
      transformCompany(documentedOrganization({ website: 'not a url' })).domain,
    ).toBeUndefined()
  })

  it('throws on an organization with no name instead of inventing one', () => {
    expect(() =>
      transformCompany(documentedOrganization({ name: undefined as unknown as string })),
    ).toThrow(/name/)
  })

  it('untransforms Company to the existing write payload', () => {
    const out = untransformCompany({ name: 'Schmidt AG', domain: 'https://schmidt.de' })
    expect(out['name']).toBe('Schmidt AG')
    expect(out['website']).toBe('https://schmidt.de')
  })
})
