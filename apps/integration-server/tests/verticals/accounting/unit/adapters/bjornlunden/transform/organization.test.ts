import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type BlOrganization } from '../../../../../../../src/verticals/accounting/adapters/bjornlunden/transform/organization'

function makeOrganization(overrides: Partial<BlOrganization> = {}): BlOrganization {
  return {
    Id: 'org-uuid-1234',
    Name: 'Acme AB',
    LegalName: 'Acme Aktiebolag',
    OrgNumber: '556677-8899',
    Currency: 'SEK',
    Website: 'https://acme.se',
    Address1: 'Storgatan 1',
    City: 'Stockholm',
    ZipCode: '11122',
    Country: 'SE',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.id).toBe('org-uuid-1234')
  })

  it('maps name', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Acme AB')
  })

  it('maps legalName', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.legalName).toBe('Acme Aktiebolag')
  })

  it('maps orgNumber to taxNumber', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.taxNumber).toBe('556677-8899')
  })

  it('maps currency', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.currency).toBe('SEK')
  })

  it('maps website', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.website).toBe('https://acme.se')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address).toEqual({
      address1: 'Storgatan 1',
      city: 'Stockholm',
      postalCode: '11122',
      country: 'SE',
    })
  })

  it('returns undefined for empty string fields', () => {
    const result = transformOrganization(
      makeOrganization({ Name: '', LegalName: '', OrgNumber: '', Currency: '', Website: '' }),
    )
    expect(result.name).toBeUndefined()
    expect(result.legalName).toBeUndefined()
    expect(result.taxNumber).toBeUndefined()
    expect(result.currency).toBeUndefined()
    expect(result.website).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrganization()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
