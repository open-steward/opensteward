import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type FactusolOrganization } from '../../../../../../../src/verticals/accounting/adapters/factusol/transform/organization'

function makeOrganization(overrides: Partial<FactusolOrganization> = {}): FactusolOrganization {
  return {
    nombre: 'Industrias del Levante S.L.',
    razon_social: 'Industrias del Levante Español S.L.',
    nif: 'B23456789',
    divisa: 'EUR',
    web: 'https://industriaslevante.es',
    direccion: 'Calle de la Industria 25',
    ciudad: 'Valencia',
    codigo_postal: '46001',
    pais: 'ES',
    provincia: 'Valencia',
    ...overrides,
  }
}

describe('transformOrganization (factusol)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Industrias del Levante S.L.')
    expect(result.legalName).toBe('Industrias del Levante Español S.L.')
    expect(result.taxNumber).toBe('B23456789')
    expect(result.currency).toBe('EUR')
    expect(result.website).toBe('https://industriaslevante.es')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.city).toBe('Valencia')
    expect(result.address?.country).toBe('ES')
    expect(result.address?.region).toBe('Valencia')
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
