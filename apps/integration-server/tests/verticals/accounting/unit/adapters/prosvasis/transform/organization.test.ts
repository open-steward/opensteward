import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type ProsvasisOrganization } from '../../../../../../../src/verticals/accounting/adapters/prosvasis/transform/organization'

function makeOrganization(overrides: Partial<ProsvasisOrganization> = {}): ProsvasisOrganization {
  return {
    id: '1',
    CompanyName: 'Prosvasis Demo Company',
    TaxId: 'EL777888999',
    Address: 'Pireos 100',
    Email: 'demo@prosvasis.gr',
    Phone: '+302105551234',
    ...overrides,
  }
}

describe('transformOrganization (Prosvasis)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Prosvasis Demo Company')
    expect(result.legalName).toBe('Prosvasis Demo Company')
    expect(result.taxNumber).toBe('EL777888999')
  })

  it('maps address', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('Pireos 100')
  })

  it('stores email in metadata', () => {
    const result = transformOrganization(makeOrganization())
    expect((result.metadata as Record<string, unknown>)['Email']).toBe('demo@prosvasis.gr')
  })

  it('stores phone in metadata', () => {
    const result = transformOrganization(makeOrganization())
    expect((result.metadata as Record<string, unknown>)['Phone']).toBe('+302105551234')
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
