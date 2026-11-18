import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type DaftraCompany } from '../../../../../../../src/verticals/accounting/adapters/daftra/transform/organization'

function makeRaw(overrides: Partial<DaftraCompany> = {}): DaftraCompany {
  return {
    id: 'org1',
    name: 'Nile Enterprises LLC',
    email: 'admin@nile.eg',
    phone: '+20225678901',
    address: '88 Nile Corniche, Giza',
    tax_number: 'EG111222333',
    currency_code: 'EGP',
    ...overrides,
  }
}

describe('transformOrganization (daftra)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeRaw())
    expect(result.id).toBe('org1')
    expect(result.name).toBe('Nile Enterprises LLC')
    expect(result.legalName).toBe('Nile Enterprises LLC')
    expect(result.taxNumber).toBe('EG111222333')
    expect(result.currency).toBe('EGP')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('sets legalName equal to name', () => {
    const result = transformOrganization(makeRaw({ name: 'Delta Co' }))
    expect(result.name).toBe('Delta Co')
    expect(result.legalName).toBe('Delta Co')
  })

  it('maps address field', () => {
    const result = transformOrganization(makeRaw())
    expect(result.address).toBeDefined()
  })

  it('handles missing id gracefully', () => {
    const result = transformOrganization(makeRaw({ id: undefined }))
    expect(result.id).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformOrganization({})
    expect(result.id).toBeUndefined()
    expect(result.name).toBeUndefined()
    expect(result.taxNumber).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('maps currency correctly', () => {
    const result = transformOrganization(makeRaw({ currency_code: 'USD' }))
    expect(result.currency).toBe('USD')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
