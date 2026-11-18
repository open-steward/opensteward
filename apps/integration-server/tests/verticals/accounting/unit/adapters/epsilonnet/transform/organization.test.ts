import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type EpsilonNetOrganization } from '../../../../../../../src/verticals/accounting/adapters/epsilonnet/transform/organization'

function makeOrganization(overrides: Partial<EpsilonNetOrganization> = {}): EpsilonNetOrganization {
  return {
    id: '1',
    companyName: 'My Company ΑΕ',
    vatNumber: 'EL987654321',
    address: 'Syntagma 1',
    email: 'company@example.gr',
    phone: '+302109876543',
    ...overrides,
  }
}

describe('transformOrganization (EpsilonNet)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('My Company ΑΕ')
    expect(result.legalName).toBe('My Company ΑΕ')
    expect(result.taxNumber).toBe('EL987654321')
  })

  it('maps address', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('Syntagma 1')
  })

  it('does not map email (Organization schema has no emails field)', () => {
    const result = transformOrganization(makeOrganization())
    expect(result).not.toHaveProperty('emails')
  })

  it('does not map phone (Organization schema has no telephones field)', () => {
    const result = transformOrganization(makeOrganization())
    expect(result).not.toHaveProperty('telephones')
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
