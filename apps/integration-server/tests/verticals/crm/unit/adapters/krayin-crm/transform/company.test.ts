/**
 * Fixture: one OrganizationResource as krayin/rest-api emits it
 * (src/Http/Resources/V1/Contact/OrganizationResource.php), with the documented
 * example address of src/Docs/Models/Contact/Organization.php.
 */
import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  type RawKrayinOrganization,
} from '../../../../../../../src/verticals/crm/adapters/krayin-crm/transform/company'

function doc(): RawKrayinOrganization {
  return {
    id: 1,
    name: 'Organization Name',
    address: {
      address: '123 Main St',
      city: 'Los Angeles',
      state: 'CA',
      country: 'US',
      postcode: '90001',
    },
    created_at: '2020-01-27 17:50:45',
    updated_at: '2020-01-27 17:50:45',
  }
}

describe('krayin-crm transformCompany', () => {
  it('maps the documented resource and satisfies the canonical schema', () => {
    const out = CompanySchema.parse(transformCompany(doc()))
    expect(out).toMatchObject({
      id: '1',
      name: 'Organization Name',
      address: {
        line1: '123 Main St',
        city: 'Los Angeles',
        region: 'CA',
        country: 'US',
        postalCode: '90001',
      },
      created_at: '2020-01-27T17:50:45.000Z',
      updated_at: '2020-01-27T17:50:45.000Z',
    })
  })

  it('maps no fields OrganizationResource does not emit', () => {
    const out = transformCompany(doc())
    expect(out.domain).toBeUndefined()
    expect(out.phone).toBeUndefined()
  })

  it('drops a country that is not an ISO 3166-1 alpha-2 code', () => {
    const out = CompanySchema.parse(
      transformCompany({ ...doc(), address: { country: 'United States' } }),
    )
    expect(out.address?.country).toBeUndefined()
  })

  it('handles a null address', () => {
    expect(
      CompanySchema.parse(transformCompany({ ...doc(), address: null })).address,
    ).toBeUndefined()
  })

  it('throws instead of inventing a missing id or name', () => {
    expect(() => transformCompany({ ...doc(), id: undefined })).toThrow(/no id/)
    expect(() => transformCompany({ ...doc(), name: undefined })).toThrow(/name/)
  })
})
