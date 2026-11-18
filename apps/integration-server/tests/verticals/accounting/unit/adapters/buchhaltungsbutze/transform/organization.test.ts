import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type BuchhaltungsButzeOrganization } from '../../../../../../../src/verticals/accounting/adapters/buchhaltungsbutze/transform/organization'

function makeOrg(overrides: Partial<BuchhaltungsButzeOrganization> = {}): BuchhaltungsButzeOrganization {
  return {
    id: 'org-1',
    company_name: 'Muster AG',
    tax_number: 'DE123456789',
    street: 'Hauptstraße 1',
    zip: '10115',
    city: 'Berlin',
    country: 'DE',
    currency: 'EUR',
    email: 'info@muster.de',
    phone: '+49 30 0',
    ...overrides,
  }
}

describe('transformOrganization (BuchhaltungsButze)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrg())
    expect(result.name).toBe('Muster AG')
    expect(result.taxNumber).toBe('DE123456789')
    expect(result.currency).toBe('EUR')
  })

  it('maps address correctly', () => {
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
