/**
 * HighLevel companies are the sub-account's Businesses (API Version 2021-07-28).
 *
 * The fixture is the documented example response of GET /businesses/
 * (https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/businesses/get-businesses-by-location),
 * a `BusinessDto` in GoHighLevel's own spec
 * (https://raw.githubusercontent.com/GoHighLevel/highlevel-api-docs/main/apps/businesses.json).
 * The rendered page obfuscates the example email, so it comes from the spec's
 * `BusinessDto.email` example instead.
 */
import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawHighLevelCompany,
} from '../../../../../../../src/verticals/crm/adapters/highlevel/transform/company'

const DOCUMENTED: RawHighLevelCompany = {
  id: '63771dcac1116f0e21de8e12',
  name: 'Microsoft',
  phone: 'string',
  email: 'abc@microsoft.com',
  website: 'microsoft.com',
  address: 'string',
  city: 'string',
  description: 'string',
  state: 'string',
  postalCode: 'string',
  country: 'united states',
  updatedBy: {},
  locationId: 'string',
  createdBy: {},
  createdAt: '2024-07-29T15:51:28.071Z',
  updatedAt: '2024-07-29T15:51:28.071Z',
}

describe('highlevel transformCompany (BusinessDto)', () => {
  it('maps the documented example to a canonical company', () => {
    const company = CompanySchema.parse(transformCompany(DOCUMENTED))
    expect(company).toEqual({
      id: '63771dcac1116f0e21de8e12',
      name: 'Microsoft',
      domain: 'microsoft.com',
      phone: 'string',
      // "united states" is not an ISO 3166-1 alpha-2 code: it stays in metadata only.
      address: { line1: 'string', city: 'string', region: 'string', postalCode: 'string' },
      created_at: '2024-07-29T15:51:28.071Z',
      updated_at: '2024-07-29T15:51:28.071Z',
      metadata: DOCUMENTED,
    })
  })

  it('omits every optional field the business does not carry', () => {
    const raw: RawHighLevelCompany = { id: 'b-1', name: 'Acme', locationId: 'loc-1' }
    const company = CompanySchema.parse(transformCompany(raw))
    expect(company).toEqual({ id: 'b-1', name: 'Acme', metadata: raw })
  })

  it('builds an address from whichever documented address parts are present', () => {
    const raw: RawHighLevelCompany = { id: 'b-2', name: 'Acme', locationId: 'l', city: 'Austin' }
    expect(CompanySchema.parse(transformCompany(raw)).address).toEqual({ city: 'Austin' })
  })

  it('keeps a country that is an ISO 3166-1 alpha-2 code, as the create example sends it', () => {
    const raw: RawHighLevelCompany = { id: 'b-3', name: 'Acme', locationId: 'l', country: 'us' }
    expect(CompanySchema.parse(transformCompany(raw)).address).toEqual({ country: 'US' })
  })

  it('preserves the raw business as metadata by reference', () => {
    expect(transformCompany(DOCUMENTED).metadata).toBe(DOCUMENTED)
  })
})

describe('highlevel untransformCompany', () => {
  it('includes locationId', () => {
    const result = untransformCompany({ name: 'Acme' }, 'loc-2')
    expect(result.locationId).toBe('loc-2')
    expect(result.name).toBe('Acme')
  })
})
