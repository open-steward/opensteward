/** Saasu File Identity → Organization, over the documented GET FileIdentity sample. */
import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization } from '../../../../../../../src/verticals/accounting/adapters/saasu/transform/organization'
import { fileIdentity } from '../fixtures'

describe('transformOrganization (saasu)', () => {
  it('maps the documented fields, with the FileId as id', () => {
    const org = OrganizationSchema.parse(transformOrganization(fileIdentity(), '12345'))
    expect(org).toMatchObject({
      id: '12345',
      name: 'Test File',
      legalName: 'Some Legal Name',
      taxNumber: '53004085616',
      organizationCode: '007249989',
      website: 'http://somehost.com',
      address: {
        address1: '1 brown st',
        city: 'Sydney',
        region: 'NSW',
        postalCode: '2000',
        country: 'AU',
      },
    })
    expect(org.fiscalYearEndMonth).toBeUndefined()
    expect(org.currency).toBeUndefined()
  })

  it('reports the base currency and a real FYE month', () => {
    const org = OrganizationSchema.parse(
      transformOrganization(fileIdentity({ CurrencyCode: 'AUD', FinancialYearEndMonth: 6 }), '1'),
    )
    expect(org).toMatchObject({ currency: 'AUD', fiscalYearEndMonth: 6 })
  })

  it('leaves out a website that is not an absolute URL', () => {
    const org = OrganizationSchema.parse(
      transformOrganization(fileIdentity({ Website: 'www.x.com' }), '1'),
    )
    expect(org.website).toBeUndefined()
  })
})
