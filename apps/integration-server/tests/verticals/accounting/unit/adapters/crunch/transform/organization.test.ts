import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type CrunchCompanyDetails,
} from '../../../../../../../src/verticals/accounting/adapters/crunch/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeOrg(overrides: Partial<CrunchCompanyDetails> = {}): CrunchCompanyDetails {
  return {
    companyName: 'Crunch Accounting Ltd',
    companyNumber: '12345678',
    vatRegistrationNumber: 'GB123456789',
    businessAddress: {
      addressLine1: '100 Tech Road',
      addressCity: 'London',
      addressPostCode: 'EC1A 1BB',
      addressCountry: 'GB',
    },
    ...overrides,
  }
}

describe('transformOrganization (crunch)', () => {
  it('maps companyName to name', () => {
    expect(transformOrganization(makeOrg()).name).toBe('Crunch Accounting Ltd')
  })

  it('maps companyNumber to organizationCode', () => {
    expect(transformOrganization(makeOrg()).organizationCode).toBe('12345678')
  })

  it('maps vatRegistrationNumber to taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('GB123456789')
  })

  it('maps businessAddress fields', () => {
    const result = transformOrganization(makeOrg())
    expect(result.address?.address1).toBe('100 Tech Road')
    expect(result.address?.city).toBe('London')
    expect(result.address?.postalCode).toBe('EC1A 1BB')
    expect(result.address?.country).toBe('GB')
  })

  it('falls back to registeredAddress when businessAddress absent', () => {
    const result = transformOrganization(
      makeOrg({
        businessAddress: undefined,
        registeredAddress: {
          addressLine1: '50 Reg Street',
          addressCity: 'Manchester',
          addressPostCode: 'M1 1AB',
          addressCountry: 'GB',
        },
      }),
    )
    expect(result.address?.address1).toBe('50 Reg Street')
  })

  it('omits address when both address objects are absent', () => {
    expect(
      transformOrganization(makeOrg({ businessAddress: undefined, registeredAddress: undefined }))
        .address,
    ).toBeUndefined()
  })

  it('has no id (Crunch company details carry no id)', () => {
    expect(transformOrganization(makeOrg()).id).toBeUndefined()
  })

  it('attaches raw as metadata', () => {
    const raw = makeOrg()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('passes OrganizationSchema.parse without throwing', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
