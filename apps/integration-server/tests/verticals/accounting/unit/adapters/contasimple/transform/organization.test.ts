import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type ContasimpleOrganization } from '../../../../../../../src/verticals/accounting/adapters/contasimple/transform/organization'

function makeOrganization(overrides: Partial<ContasimpleOrganization> = {}): ContasimpleOrganization {
  return {
    nombre: 'Soluciones Tech S.L.',
    razon_social: 'Soluciones Tecnológicas Ibéricas S.L.',
    nif: 'B11223344',
    moneda: 'EUR',
    web: 'https://solucionestech.es',
    direccion: 'Gran Vía 50',
    ciudad: 'Madrid',
    codigo_postal: '28013',
    pais: 'ES',
    provincia: 'Madrid',
    ...overrides,
  }
}

describe('transformOrganization (contasimple)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Soluciones Tech S.L.')
    expect(result.legalName).toBe('Soluciones Tecnológicas Ibéricas S.L.')
    expect(result.taxNumber).toBe('B11223344')
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
