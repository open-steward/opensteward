import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type ColppyCompanyInfo } from '../../../../../../../src/verticals/accounting/adapters/colppy/transform/organization'

function makeOrganization(overrides: Partial<ColppyCompanyInfo> = {}): ColppyCompanyInfo {
  return {
    nombreEmpresa: 'Mi Empresa',
    razonSocial: 'Mi Empresa SRL',
    cuit: '30-71234567-8',
    moneda: 'ARS',
    sitioWeb: 'https://miempresa.com.ar',
    direccion: 'Av. de Mayo 1000',
    ciudad: 'Buenos Aires',
    codigoPostal: 'C1084',
    provincia: 'CABA',
    pais: 'AR',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Mi Empresa')
    expect(result.legalName).toBe('Mi Empresa SRL')
    expect(result.taxNumber).toBe('30-71234567-8')
    expect(result.currency).toBe('ARS')
    expect(result.website).toBe('https://miempresa.com.ar')
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrganization()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('Av. de Mayo 1000')
    expect(result.address?.city).toBe('Buenos Aires')
    expect(result.address?.region).toBe('CABA')
    expect(result.address?.country).toBe('AR')
  })

  it('returns undefined for empty fields', () => {
    const result = transformOrganization(makeOrganization({ sitioWeb: '', nombreEmpresa: '' }))
    expect(result.website).toBeUndefined()
    expect(result.name).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
