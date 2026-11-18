import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type AccountableOrganization } from '../../../../../../../src/verticals/accounting/adapters/accountable/transform/organization'

function makeOrg(overrides: Partial<AccountableOrganization> = {}): AccountableOrganization {
  return {
    id: 'org-1',
    name: 'Muster AG',
    legalName: 'Muster Aktiengesellschaft',
    taxId: 'DE123456789',
    currency: 'EUR',
    address: {
      street: 'Hauptstraße 1',
      city: 'Berlin',
      postalCode: '10115',
      country: 'DE',
    },
    ...overrides,
  }
}

describe('transformOrganization (Accountable)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrg())
    expect(result.name).toBe('Muster AG')
    expect(result.legalName).toBe('Muster Aktiengesellschaft')
    expect(result.taxNumber).toBe('DE123456789')
    expect(result.currency).toBe('EUR')
  })

  it('maps address nested object', () => {
    const result = transformOrganization(makeOrg())
    expect(result.address?.city).toBe('Berlin')
    expect(result.address?.country).toBe('DE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrg()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
