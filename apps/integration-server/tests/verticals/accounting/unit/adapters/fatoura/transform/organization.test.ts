import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type FatouaCompany } from '../../../../../../../src/verticals/accounting/adapters/fatoura/transform/organization'

function makeRaw(overrides: Partial<FatouaCompany> = {}): FatouaCompany {
  return {
    id: 'org1',
    name: 'Saudi Holdings Co',
    email: 'ceo@saudiholdings.sa',
    phone: '+966112345678',
    address: '1 King Abdullah Rd, Riyadh',
    vat_number: 'SA300999888777',
    currency: 'SAR',
    ...overrides,
  }
}

describe('transformOrganization (fatoura)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeRaw())
    expect(result.id).toBe('org1')
    expect(result.name).toBe('Saudi Holdings Co')
    expect(result.legalName).toBe('Saudi Holdings Co')
    expect(result.taxNumber).toBe('SA300999888777')
    expect(result.currency).toBe('SAR')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('sets legalName equal to name', () => {
    const result = transformOrganization(makeRaw({ name: 'New Name Co' }))
    expect(result.name).toBe('New Name Co')
    expect(result.legalName).toBe('New Name Co')
  })

  it('maps address field', () => {
    const result = transformOrganization(makeRaw())
    expect(result.address).toBeDefined()
  })

  it('uses vat_number as taxNumber', () => {
    const result = transformOrganization(makeRaw({ vat_number: 'SA300777666555' }))
    expect(result.taxNumber).toBe('SA300777666555')
  })

  it('handles missing id gracefully', () => {
    const result = transformOrganization(makeRaw({ id: undefined }))
    expect(result.id).toBeUndefined()
  })

  it('handles missing address gracefully', () => {
    const result = transformOrganization(makeRaw({ address: undefined }))
    expect(result.address).toBeUndefined()
  })

  it('handles empty object gracefully', () => {
    const result = transformOrganization({})
    expect(result.id).toBeUndefined()
    expect(result.name).toBeUndefined()
    expect(result.taxNumber).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
