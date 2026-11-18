import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type ChipaxCompanyInfo } from '../../../../../../../src/verticals/accounting/adapters/chipax/transform/organization'

function makeOrganization(overrides: Partial<ChipaxCompanyInfo> = {}): ChipaxCompanyInfo {
  return {
    nombre: 'Mi Empresa',
    razonSocial: 'Mi Empresa SpA',
    rut: '76.000.000-K',
    direccion: 'Av. Providencia 1234',
    ciudad: 'Santiago',
    comuna: 'Providencia',
    pais: 'CL',
    email: 'info@miempresa.cl',
    telefono: '+56221234567',
    sitioWeb: 'https://miempresa.cl',
    moneda: 'CLP',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Mi Empresa')
    expect(result.legalName).toBe('Mi Empresa SpA')
    expect(result.taxNumber).toBe('76.000.000-K')
    expect(result.currency).toBe('CLP')
    expect(result.website).toBe('https://miempresa.cl')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('Av. Providencia 1234')
    expect(result.address?.city).toBe('Santiago')
    expect(result.address?.region).toBe('Providencia')
    expect(result.address?.country).toBe('CL')
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrganization()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined for empty string fields', () => {
    const result = transformOrganization(makeOrganization({ nombre: '', sitioWeb: '' }))
    expect(result.name).toBeUndefined()
    expect(result.website).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
