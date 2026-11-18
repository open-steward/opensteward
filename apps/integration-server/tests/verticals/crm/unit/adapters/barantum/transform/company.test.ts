import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawBarantumCompany,
} from '../../../../../../../src/verticals/crm/adapters/barantum/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { DOC_ORG } from '../fixtures/documented'

const doc = (overrides: Partial<RawBarantumCompany> = {}): RawBarantumCompany => ({
  ...DOC_ORG,
  ...overrides,
})

describe('barantum transformCompany (documented Org row)', () => {
  it('parses against CompanySchema', () => {
    const c = CompanySchema.parse(transformCompany(doc()))
    expect(c.id).toBe('d4e2a745-82fa-4b58-8490-f682bff30959')
    expect(c.name).toBe('DeepMind Corp 2')
    expect(c.phone).toBe('62217890098')
    expect(c.industry).toBeUndefined()
    expect(c.address).toEqual({
      line1: 'Jl. Sudirman, Balikpapan. Indonesia',
      city: undefined,
      region: undefined,
      postalCode: undefined,
    })
    expect(c.domain).toBeUndefined()
    expect(c.owner_id).toBeUndefined()
    expect(c.created_at).toBeUndefined()
    expect(c.metadata).toEqual(DOC_ORG)
  })

  it('maps org_industry', () => {
    expect(
      CompanySchema.parse(transformCompany(doc({ org_industry: 'Technology' }))).industry,
    ).toBe('Technology')
  })

  it('maps org_address_city, org_address_state and org_address_postalcode', () => {
    const c = CompanySchema.parse(
      transformCompany(
        doc({
          org_address_city: 'Balikpapan',
          org_address_state: 'Kalimantan Timur',
          org_address_postalcode: '76114',
        }),
      ),
    )
    expect(c.address).toEqual({
      line1: 'Jl. Sudirman, Balikpapan. Indonesia',
      city: 'Balikpapan',
      region: 'Kalimantan Timur',
      postalCode: '76114',
    })
  })

  it('omits the address when every address field is unset', () => {
    expect(transformCompany(doc({ org_address_street: null })).address).toBeUndefined()
  })

  it('throws on a row with no org_uuid or no org_name', () => {
    expect(() => transformCompany(doc({ org_uuid: '' }))).toThrow(/org_uuid/)
    expect(() => transformCompany(doc({ org_name: null }))).toThrow(/org_name/)
  })
})

describe('barantum untransformCompany', () => {
  it('maps name back', () => {
    expect(untransformCompany({ name: 'Acme' }).name).toBe('Acme')
  })

  it('maps domain back', () => {
    expect(untransformCompany({ domain: 'acme.co.id' }).domain).toBe('acme.co.id')
  })

  it('maps phone back', () => {
    expect(untransformCompany({ phone: '+622112345678' }).phone).toBe('+622112345678')
  })

  it('maps industry back', () => {
    expect(untransformCompany({ industry: 'Technology' }).industry).toBe('Technology')
  })

  it('maps size back to employee_count', () => {
    expect(untransformCompany({ size: 350 }).employee_count).toBe(350)
  })
})
