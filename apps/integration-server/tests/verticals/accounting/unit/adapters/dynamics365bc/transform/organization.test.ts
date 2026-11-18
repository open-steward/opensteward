import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type BCCompany } from '../../../../../../../src/verticals/accounting/adapters/dynamics365bc/transform/organization'

function makeCompany(overrides: Partial<BCCompany> = {}): BCCompany {
  return {
    id: 'bc-company-1',
    systemVersion: '1',
    timestamp: 1000,
    name: 'My Company Ltd',
    displayName: 'My Company',
    businessProfileId: '',
    systemCreatedAt: '2024-01-01',
    systemCreatedBy: 'user',
    systemModifiedAt: '2024-01-02',
    systemModifiedBy: 'user',
    taxRegistrationNumber: 'GB123456789',
    currencyCode: 'GBP',
    ...overrides,
  }
}

describe('transformOrganization (dynamics365bc)', () => {
  it('maps id and name fields', () => {
    const raw = makeCompany()
    const result = transformOrganization(raw)
    expect(result.id).toBe('bc-company-1')
    expect(result.name).toBe('My Company')
    expect(result.legalName).toBe('My Company Ltd')
  })

  it('maps taxNumber from taxRegistrationNumber', () => {
    const result = transformOrganization(makeCompany({ taxRegistrationNumber: 'GB999' }))
    expect(result.taxNumber).toBe('GB999')
  })

  it('maps currency', () => {
    const result = transformOrganization(makeCompany({ currencyCode: 'USD' }))
    expect(result.currency).toBe('USD')
  })

  it('maps address when present', () => {
    const raw = makeCompany({
      address: { street: '1 High St', city: 'London', countryLetterCode: 'GB', postalCode: 'EC1A 1BB', state: 'England' },
    })
    const result = transformOrganization(raw)
    expect(result.address?.address1).toBe('1 High St')
    expect(result.address?.city).toBe('London')
    expect(result.address?.country).toBe('GB')
    expect(result.address?.postalCode).toBe('EC1A 1BB')
  })

  it('omits address when not present', () => {
    const result = transformOrganization(makeCompany({ address: undefined }))
    expect(result.address).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeCompany()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = makeCompany()
    const result = transformOrganization(raw)
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
