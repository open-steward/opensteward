import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type Unit4Organization } from '../../../../../../../src/verticals/accounting/adapters/unit4/transform/organization'

function makeOrganization(overrides: Partial<Unit4Organization> = {}): Unit4Organization {
  return {
    companyId: 'co_001',
    name: 'City Council',
    legalName: 'City Council Government Entity',
    organizationNumber: 'GOV-001',
    vatNumber: 'VAT-GOV-001',
    email: 'finance@citycouncil.gov',
    phone: '+1-800-555-0100',
    address: {
      street: '1 City Hall Square',
      city: 'Metropolis',
      postalCode: 'MET 001',
      country: 'US',
    },
    ...overrides,
  }
}

describe('transformOrganization (Unit4)', () => {
  it('maps name', () => {
    expect(transformOrganization(makeOrganization({ name: 'Gov Corp' })).name).toBe('Gov Corp')
  })

  it('maps legalName', () => {
    expect(transformOrganization(makeOrganization({ legalName: 'Gov Corp Ltd' })).legalName).toBe('Gov Corp Ltd')
  })

  it('falls back to name for legalName when absent', () => {
    const raw = makeOrganization()
    delete raw.legalName
    expect(transformOrganization(raw).legalName).toBe('City Council')
  })

  it('maps vatNumber to taxNumber', () => {
    expect(transformOrganization(makeOrganization({ vatNumber: 'VAT-123' })).taxNumber).toBe('VAT-123')
  })

  it('falls back to organizationNumber for taxNumber', () => {
    const raw = makeOrganization({ organizationNumber: 'ORG-456' })
    delete raw.vatNumber
    expect(transformOrganization(raw).taxNumber).toBe('ORG-456')
  })

  it('maps address', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('1 City Hall Square')
    expect(result.address?.city).toBe('Metropolis')
    expect(result.address?.country).toBe('US')
  })

  it('returns no address when absent', () => {
    const raw = makeOrganization()
    delete raw.address
    expect(transformOrganization(raw).address).toBeUndefined()
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization({ name: 'Gov Corp' }))
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
