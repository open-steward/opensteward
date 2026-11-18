import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type InvoicePortalOrganization } from '../../../../../../../src/verticals/accounting/adapters/invoiceportal/transform/organization'

function makeOrg(overrides: Partial<InvoicePortalOrganization> = {}): InvoicePortalOrganization {
  return {
    id: 'org-1',
    name: 'Muster AG',
    legal_name: 'Muster Aktiengesellschaft',
    vat_number: 'DE123456789',
    street: 'Hauptstraße 1',
    zip: '10115',
    city: 'Berlin',
    country: 'DE',
    currency_code: 'EUR',
    ...overrides,
  }
}

describe('transformOrganization (Invoice-Portal)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrg())
    expect(result.name).toBe('Muster AG')
    expect(result.legalName).toBe('Muster Aktiengesellschaft')
    expect(result.taxNumber).toBe('DE123456789')
    expect(result.currency).toBe('EUR')
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
