import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type InvoiceNinjaCompany,
} from '../../../../../../../src/verticals/accounting/adapters/invoice-ninja/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeCompany(overrides: Partial<InvoiceNinjaCompany> = {}): InvoiceNinjaCompany {
  return {
    id: 'company-1',
    settings: {
      id: 'settings-1',
      name: 'Acme Industries',
      id_number: 'acme-001',
      vat_number: 'US-123456789',
      address1: '100 Commerce Blvd',
      address2: 'Floor 3',
      city: 'New York',
      state: 'NY',
      postal_code: '10001',
      // country_id is a numeric internal ID — omit to avoid failing the ISO alpha-2 address schema constraint
      country_id: null,
      phone: '+1-212-555-0000',
      email: 'info@acme.example',
      website: 'https://www.acme.example',
      currency_id: '1', // USD
    },
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps name from settings.name', () => {
    expect(transformOrganization(makeCompany()).name).toBe('Acme Industries')
  })

  it('maps legalName from settings.name', () => {
    expect(transformOrganization(makeCompany()).legalName).toBe('Acme Industries')
  })

  it('maps taxNumber from vat_number', () => {
    expect(transformOrganization(makeCompany()).taxNumber).toBe('US-123456789')
  })

  it('falls back to id_number for taxNumber when vat_number is absent', () => {
    const result = transformOrganization(
      makeCompany({
        settings: {
          id: 's',
          name: 'Acme',
          vat_number: null,
          id_number: 'acme-001',
        },
      }),
    )
    expect(result.taxNumber).toBe('acme-001')
  })

  it('maps currency_id=1 to USD', () => {
    expect(transformOrganization(makeCompany()).currency).toBe('USD')
  })

  it('returns undefined currency when currency_id is absent', () => {
    const result = transformOrganization(
      makeCompany({ settings: { id: 's', currency_id: undefined } }),
    )
    expect(result.currency).toBeUndefined()
  })

  it('maps website from settings.website', () => {
    expect(transformOrganization(makeCompany()).website).toBe('https://www.acme.example')
  })

  it('returns undefined website when absent', () => {
    const result = transformOrganization(makeCompany({ settings: { id: 's', website: null } }))
    expect(result.website).toBeUndefined()
  })

  it('maps address fields from settings', () => {
    const result = transformOrganization(makeCompany())
    expect(result.address?.address1).toBe('100 Commerce Blvd')
    expect(result.address?.city).toBe('New York')
    expect(result.address?.postalCode).toBe('10001')
  })

  it('handles missing settings gracefully (uses empty settings)', () => {
    const result = transformOrganization({ id: 'company-2', settings: null })
    expect(result.name).toBeUndefined()
    expect(result.taxNumber).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('passes raw company object (not settings) as metadata', () => {
    const raw = makeCompany()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
    // metadata should be the company, not the settings object
    expect((result.metadata as Record<string, unknown>)['id']).toBe('company-1')
  })

  it('passes OrganizationSchema validation', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeCompany()))).not.toThrow()
  })
})
