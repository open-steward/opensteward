import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type DextClientDetail,
} from '../../../../../../../src/verticals/accounting/adapters/dext/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeOrg(overrides: Partial<DextClientDetail> = {}): DextClientDetail {
  return {
    id: 'client-123',
    name: 'Dext Demo Co',
    providerId: 'prov-1',
    practiceCode: 'PRAC001',
    organisationType: 'COMPANY',
    vatDetails: {
      scheme: 'STANDARD',
      number: 'GB 123456789',
    },
    ...overrides,
  }
}

describe('transformOrganization (dext)', () => {
  it('maps id', () => {
    expect(transformOrganization(makeOrg()).id).toBe('client-123')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrg()).name).toBe('Dext Demo Co')
  })

  it('maps practiceCode to organizationCode', () => {
    expect(transformOrganization(makeOrg()).organizationCode).toBe('PRAC001')
  })

  it('maps vatDetails.number to taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('GB 123456789')
  })

  it('omits organizationCode when practiceCode is null', () => {
    expect(transformOrganization(makeOrg({ practiceCode: null })).organizationCode).toBeUndefined()
  })

  it('omits taxNumber when vatDetails absent', () => {
    expect(transformOrganization(makeOrg({ vatDetails: undefined })).taxNumber).toBeUndefined()
  })

  it('does not map address (Dext has none)', () => {
    expect(transformOrganization(makeOrg()).address).toBeUndefined()
  })

  it('does not map createdAt or updatedAt (Dext has none)', () => {
    const result = transformOrganization(makeOrg())
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
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
