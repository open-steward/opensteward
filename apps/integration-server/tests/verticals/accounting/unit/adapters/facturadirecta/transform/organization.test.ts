import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type FacturadirectaOrganization } from '../../../../../../../src/verticals/accounting/adapters/facturadirecta/transform/organization'

function makeOrganization(overrides: Partial<FacturadirectaOrganization> = {}): FacturadirectaOrganization {
  return {
    name: 'Grupo Empresarial S.L.',
    legal_name: 'Grupo Empresarial Español S.L.',
    tax_id: 'B98712345',
    currency: 'EUR',
    website: 'https://grupoempresarial.es',
    address: 'Avenida de América 100',
    city: 'Madrid',
    postal_code: '28028',
    country: 'ES',
    region: 'Madrid',
    ...overrides,
  }
}

describe('transformOrganization (facturadirecta)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Grupo Empresarial S.L.')
    expect(result.legalName).toBe('Grupo Empresarial Español S.L.')
    expect(result.taxNumber).toBe('B98712345')
    expect(result.currency).toBe('EUR')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.city).toBe('Madrid')
    expect(result.address?.country).toBe('ES')
    expect(result.address?.region).toBe('Madrid')
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
