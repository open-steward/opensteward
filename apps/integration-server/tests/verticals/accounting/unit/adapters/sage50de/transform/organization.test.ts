import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type Sage50DeOrganization } from '../../../../../../../src/verticals/accounting/adapters/sage50de/transform/organization'

function makeOrg(overrides: Partial<Sage50DeOrganization> = {}): Sage50DeOrganization {
  return {
    id: 'org-1',
    displayed_as: 'Muster AG',
    legal_name: 'Muster Aktiengesellschaft',
    tax_number: 'DE123456789',
    main_address: {
      address_line_1: 'Hauptstraße 1',
      city: 'Berlin',
      postal_code: '10115',
      country: 'DE',
    },
    currency: { id: 'EUR' },
    email: 'info@muster.de',
    telephone: '+49 30 0',
    ...overrides,
  }
}

describe('transformOrganization (Sage 50 DE)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrg())
    expect(result.name).toBe('Muster AG')
    expect(result.legalName).toBe('Muster Aktiengesellschaft')
    expect(result.taxNumber).toBe('DE123456789')
    expect(result.currency).toBe('EUR')
  })

  it('maps address from main_address', () => {
    const result = transformOrganization(makeOrg())
    expect(result.address?.address1).toBe('Hauptstraße 1')
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
