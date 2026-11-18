import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type TeamSystemCompany } from '../../../../../../../src/verticals/accounting/adapters/teamsystem/transform/organization'

function makeOrg(overrides: Partial<TeamSystemCompany> = {}): TeamSystemCompany {
  return {
    name: 'My Company', legalName: 'My Company Srl', vatNumber: 'IT09876543210', taxCode: '09876543210', address: 'Via Roma 1', city: 'Roma', postalCode: '00100', province: 'RM', country: 'IT', email: 'info@mc.it', phone: '+39', website: 'https://mc.it', currency: 'EUR',
    ...overrides,
  }
}

describe('transformOrganization (teamsystem)', () => {
  it('maps core fields', () => {
    const result = transformOrganization(makeOrg())
    expect(result.name).toBe('My Company')
    expect(result.currency).toBe('EUR')
  })

  it('maps address', () => {
    const result = transformOrganization(makeOrg())
    expect(result.address).toBeDefined()
    expect(result.address?.city).toBe('Roma')
  })

  it('passes raw as metadata', () => {
    const raw = makeOrg()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
