import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type OdooCompany,
} from '../../../../../../../src/verticals/accounting/adapters/odoo/transform/organization'

function makeOrganization(overrides: Partial<OdooCompany> = {}): OdooCompany {
  return {
    id: 1,
    name: 'My Company',
    vat: 'FR00000000000',
    currency_id: [1, 'EUR'],
    street: '10 Rue de la Paix',
    city: 'Paris',
    state_id: [6, 'Île-de-France'],
    zip: '75002',
    country_id: [76, 'France'],
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id correctly', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('1')
  })

  it('maps name correctly', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('My Company')
  })

  it('maps vat to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('FR00000000000')
  })

  it('maps currency from currency_id tuple', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('EUR')
  })

  it('maps address fields correctly', () => {
    const addr = transformOrganization(makeOrganization()).address
    expect(addr?.address1).toBe('10 Rue de la Paix')
    expect(addr?.city).toBe('Paris')
    expect(addr?.region).toBe('Île-de-France')
    expect(addr?.postalCode).toBe('75002')
    expect(addr?.country).toBe('FR')
  })

  it('prefers country_code over the locale-translated country_id display name', () => {
    // Odoo 18.0+ res.company exposes country_code (related country_id.code),
    // same as res.partner. On a German-locale session, country_id's
    // many2one display_name comes back translated ('Deutschland', not
    // 'Germany') and would not resolve through toIso3166Alpha2 on its own;
    // country_code must win whenever it's present.
    const result = transformOrganization(
      makeOrganization({ country_code: 'DE', country_id: [59, 'Deutschland'] }),
    )
    expect(result.address?.country).toBe('DE')
  })

  it('falls back to normalising the country_id display name when country_code is absent', () => {
    // Odoo 17.0 and earlier have no country_code field on res.company at
    // all, so a self-hosted instance on those versions genuinely won't
    // send it — the tuple-normalising fallback is load-bearing, not dead
    // code, for pre-18.0 instances.
    const result = transformOrganization(
      makeOrganization({ country_code: undefined, country_id: [76, 'France'] }),
    )
    expect(result.address?.country).toBe('FR')
  })

  it('returns undefined address when no address fields are set', () => {
    const org = makeOrganization({ street: undefined, city: undefined, country_id: undefined })
    expect(transformOrganization(org).address).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
