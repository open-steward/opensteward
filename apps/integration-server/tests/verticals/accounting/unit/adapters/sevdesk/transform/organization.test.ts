import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type SevDeskOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/sevdesk/transform/organization'

function makeOrganization(overrides: Partial<SevDeskOrganization> = {}): SevDeskOrganization {
  return {
    id: 'org-1',
    name: 'Acme GmbH',
    website: 'https://acme.de',
    email: 'info@acme.de',
    phone: '+49 123 456789',
    vatNumber: 'DE123456789',
    street: 'Hauptstraße 1',
    zip: '10115',
    city: 'Berlin',
    countryCode: 'DE',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps name correctly', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Acme GmbH')
  })

  it('maps vatNumber to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('DE123456789')
  })

  it('maps website correctly', () => {
    expect(transformOrganization(makeOrganization()).website).toBe('https://acme.de')
  })

  it('maps address fields correctly', () => {
    const org = transformOrganization(makeOrganization())
    expect(org.address?.address1).toBe('Hauptstraße 1')
    expect(org.address?.city).toBe('Berlin')
    expect(org.address?.postalCode).toBe('10115')
    expect(org.address?.country).toBe('DE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
