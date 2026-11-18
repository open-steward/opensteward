import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type MezanOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/mezan/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeOrg(overrides: Partial<MezanOrganization> = {}): MezanOrganization {
  return {
    id: 'org_001',
    name: 'Mezan Co',
    legal_name: 'Mezan Company LLC',
    tax_number: 'VAT-123456789',
    cr_number: 'CR-999',
    currency: 'SAR',
    timezone: 'Asia/Riyadh',
    country: 'SA',
    city: 'Riyadh',
    address: '1 King Fahd Rd',
    zipcode: '12211',
    website: 'https://mezan.example',
    fiscal_year_end_month: 12,
    ...overrides,
  }
}

describe('transformOrganization (mezan)', () => {
  it('maps id as string', () => {
    expect(transformOrganization(makeOrg()).id).toBe('org_001')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrg()).name).toBe('Mezan Co')
  })

  it('maps legal_name to legalName', () => {
    expect(transformOrganization(makeOrg()).legalName).toBe('Mezan Company LLC')
  })

  it('falls back to name when legal_name is absent', () => {
    const result = transformOrganization(makeOrg({ legal_name: undefined }))
    expect(result.legalName).toBe('Mezan Co')
  })

  it('maps tax_number to taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('VAT-123456789')
  })

  it('maps cr_number to organizationCode', () => {
    expect(transformOrganization(makeOrg()).organizationCode).toBe('CR-999')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrg()).currency).toBe('SAR')
  })

  it('maps timezone', () => {
    expect(transformOrganization(makeOrg()).timezone).toBe('Asia/Riyadh')
  })

  it('maps fiscal_year_end_month', () => {
    expect(transformOrganization(makeOrg()).fiscalYearEndMonth).toBe(12)
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrg())
    expect(result.address?.address1).toBe('1 King Fahd Rd')
    expect(result.address?.city).toBe('Riyadh')
    expect(result.address?.postalCode).toBe('12211')
    expect(result.address?.country).toBe('SA')
  })

  it('returns undefined address when no address fields present', () => {
    const result = transformOrganization(
      makeOrg({ address: undefined, city: undefined, country: undefined }),
    )
    expect(result.address).toBeUndefined()
  })

  it('maps website', () => {
    expect(transformOrganization(makeOrg()).website).toBe('https://mezan.example')
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrg()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('passes OrganizationSchema validation', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeOrg()))).not.toThrow()
  })
})
