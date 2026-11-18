import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type BrexCompany,
} from '../../../../../../../src/verticals/accounting/adapters/brex/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeCompany(overrides: Partial<BrexCompany> = {}): BrexCompany {
  return {
    id: 'company_001',
    legal_name: 'Brex Inc.',
    display_name: 'Brex',
    website: 'https://brex.com',
    ein: '12-3456789',
    business_address: {
      line1: '405 Howard St',
      line2: 'Suite 200',
      city: 'San Francisco',
      state: 'CA',
      country: 'US',
      postal_code: '94105',
    },
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id', () => {
    expect(transformOrganization(makeCompany()).id).toBe('company_001')
  })

  it('prefers display_name over legal_name for name', () => {
    const result = transformOrganization(makeCompany())
    expect(result.name).toBe('Brex')
  })

  it('falls back to legal_name when display_name is absent', () => {
    const result = transformOrganization(makeCompany({ display_name: undefined }))
    expect(result.name).toBe('Brex Inc.')
  })

  it('name is undefined when both display_name and legal_name are absent', () => {
    const result = transformOrganization(
      makeCompany({ display_name: undefined, legal_name: undefined }),
    )
    expect(result.name).toBeUndefined()
  })

  it('maps legal_name to legalName', () => {
    expect(transformOrganization(makeCompany()).legalName).toBe('Brex Inc.')
  })

  it('maps ein to taxNumber', () => {
    expect(transformOrganization(makeCompany()).taxNumber).toBe('12-3456789')
  })

  it('maps website', () => {
    expect(transformOrganization(makeCompany()).website).toBe('https://brex.com')
  })

  it('maps business_address.line1 to address.address1', () => {
    expect(transformOrganization(makeCompany()).address?.address1).toBe('405 Howard St')
  })

  it('maps business_address.line2 to address.address2', () => {
    expect(transformOrganization(makeCompany()).address?.address2).toBe('Suite 200')
  })

  it('maps business_address.city to address.city', () => {
    expect(transformOrganization(makeCompany()).address?.city).toBe('San Francisco')
  })

  it('maps business_address.state to address.region', () => {
    expect(transformOrganization(makeCompany()).address?.region).toBe('CA')
  })

  it('maps business_address.postal_code to address.postalCode', () => {
    expect(transformOrganization(makeCompany()).address?.postalCode).toBe('94105')
  })

  it('maps business_address.country to address.country', () => {
    expect(transformOrganization(makeCompany()).address?.country).toBe('US')
  })

  it('address is undefined when business_address is absent', () => {
    const result = transformOrganization(makeCompany({ business_address: undefined }))
    expect(result.address).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeCompany()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces output that passes OrganizationSchema validation', () => {
    const result = transformOrganization(makeCompany())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformOrganization(
      makeCompany({
        id: undefined,
        legal_name: undefined,
        display_name: undefined,
        website: undefined,
        ein: undefined,
        business_address: undefined,
      }),
    )
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })

  it('schema rejects a non-URL website value', () => {
    const raw = makeCompany({ website: 'not-a-valid-url' })
    const result = transformOrganization(raw)
    expect(() => OrganizationSchema.parse(result)).toThrow()
  })
})
