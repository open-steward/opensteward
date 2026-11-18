import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type AnfixOrganization } from '../../../../../../../src/verticals/accounting/adapters/anfix/transform/organization'

function makeOrganization(overrides: Partial<AnfixOrganization> = {}): AnfixOrganization {
  return {
    nombre: 'Mi Empresa S.L.',
    razon_social: 'Mi Empresa Sociedad Limitada',
    nif: 'B98765432',
    divisa: 'EUR',
    web: 'https://miempresa.es',
    direccion: 'Paseo de la Castellana 100',
    ciudad: 'Madrid',
    codigo_postal: '28046',
    pais: 'ES',
    provincia: 'Madrid',
    ...overrides,
  }
}

describe('transformOrganization (anfix)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Mi Empresa S.L.')
    expect(result.legalName).toBe('Mi Empresa Sociedad Limitada')
    expect(result.taxNumber).toBe('B98765432')
    expect(result.currency).toBe('EUR')
    expect(result.website).toBe('https://miempresa.es')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('Paseo de la Castellana 100')
    expect(result.address?.city).toBe('Madrid')
    expect(result.address?.postalCode).toBe('28046')
    expect(result.address?.country).toBe('ES')
    expect(result.address?.region).toBe('Madrid')
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const result = transformOrganization(makeOrganization({ web: '', nif: '' }))
    expect(result.website).toBeUndefined()
    expect(result.taxNumber).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
