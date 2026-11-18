import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type QuipuOrganization } from '../../../../../../../src/verticals/accounting/adapters/quipu/transform/organization'

function makeOrganization(overrides: Partial<QuipuOrganization> = {}): QuipuOrganization {
  return {
    name: 'Agencia Digital S.L.',
    legal_name: 'Agencia Digital Ibérica S.L.',
    tax_id: 'B44556677',
    currency: 'EUR',
    website: 'https://agenciadigital.es',
    address: 'Calle Sierpes 20',
    city: 'Sevilla',
    zip_code: '41004',
    country_code: 'ES',
    region: 'Andalucía',
    ...overrides,
  }
}

describe('transformOrganization (quipu)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Agencia Digital S.L.')
    expect(result.legalName).toBe('Agencia Digital Ibérica S.L.')
    expect(result.taxNumber).toBe('B44556677')
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
