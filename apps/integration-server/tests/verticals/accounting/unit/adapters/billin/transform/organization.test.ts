import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type BillinOrganization } from '../../../../../../../src/verticals/accounting/adapters/billin/transform/organization'

function makeOrganization(overrides: Partial<BillinOrganization> = {}): BillinOrganization {
  return {
    name: 'StartupESP S.L.',
    legal_name: 'StartupESP Sociedad Limitada',
    tax_id: 'B55443322',
    currency: 'EUR',
    website: 'https://startupesp.es',
    address: 'Calle Mayor 5',
    city: 'Sevilla',
    postal_code: '41001',
    country: 'ES',
    region: 'Andalucía',
    ...overrides,
  }
}

describe('transformOrganization (billin)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('StartupESP S.L.')
    expect(result.legalName).toBe('StartupESP Sociedad Limitada')
    expect(result.taxNumber).toBe('B55443322')
    expect(result.currency).toBe('EUR')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.city).toBe('Sevilla')
    expect(result.address?.country).toBe('ES')
    expect(result.address?.region).toBe('Andalucía')
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
