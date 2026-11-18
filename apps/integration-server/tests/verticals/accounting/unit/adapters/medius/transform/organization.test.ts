import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type MediusCompany,
} from '../../../../../../../src/verticals/accounting/adapters/medius/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeCompany(overrides: Partial<MediusCompany> = {}): MediusCompany {
  return {
    name: 'Acme Corp',
    companyId: 'comp_001',
    organizationNumber: 'ORG-123',
    accountingCurrencyCode: 'USD',
    isActive: true,
    addresses: [
      {
        streetAddress: '456 Market St',
        zip: '94102',
        city: 'San Francisco',
        country: 'US',
        state: 'CA',
      },
    ],
    ...overrides,
  }
}

describe('transformOrganization (medius)', () => {
  it('maps companyId to id', () => {
    expect(transformOrganization(makeCompany()).id).toBe('comp_001')
  })

  it('falls back to mediusFlowSystemId when companyId is absent', () => {
    const result = transformOrganization(
      makeCompany({ companyId: undefined, mediusFlowSystemId: 'mf_42' }),
    )
    expect(result.id).toBe('mf_42')
  })

  it('maps name', () => {
    expect(transformOrganization(makeCompany()).name).toBe('Acme Corp')
  })

  it('maps companyId to organizationCode', () => {
    expect(transformOrganization(makeCompany()).organizationCode).toBe('comp_001')
  })

  it('maps organizationNumber to taxNumber', () => {
    expect(transformOrganization(makeCompany()).taxNumber).toBe('ORG-123')
  })

  it('maps accountingCurrencyCode to currency', () => {
    expect(transformOrganization(makeCompany()).currency).toBe('USD')
  })

  it('maps first address entry to address', () => {
    const result = transformOrganization(makeCompany())
    expect(result.address?.address1).toBe('456 Market St')
    expect(result.address?.city).toBe('San Francisco')
    expect(result.address?.postalCode).toBe('94102')
    expect(result.address?.country).toBe('US')
    expect(result.address?.region).toBe('CA')
  })

  it('returns undefined address when addresses array is empty', () => {
    const result = transformOrganization(makeCompany({ addresses: [] }))
    expect(result.address).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeCompany()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('passes OrganizationSchema validation', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeCompany()))).not.toThrow()
  })
})
