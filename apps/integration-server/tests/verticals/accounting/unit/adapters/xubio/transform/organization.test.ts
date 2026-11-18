import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type XubioOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/xubio/transform/organization'

function makeOrganization(overrides: Partial<XubioOrganization> = {}): XubioOrganization {
  return {
    razonSocial: 'Xubio SA',
    cuit: '30-12345678-9',
    direccion: 'Av. Corrientes 1234',
    ciudad: 'Buenos Aires',
    codigoPostal: 'C1043',
    provincia: 'CABA',
    pais: 'AR',
    email: 'info@xubio.com',
    telefono: '+54-11-12345678',
    sitioWeb: 'https://xubio.com',
    moneda: 'ARS',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps razonSocial to name and legalName', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Xubio SA')
    expect(result.legalName).toBe('Xubio SA')
  })

  it('maps cuit to taxNumber', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.taxNumber).toBe('30-12345678-9')
  })

  it('maps moneda to currency', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.currency).toBe('ARS')
  })

  it('maps sitioWeb to website', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.website).toBe('https://xubio.com')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('Av. Corrientes 1234')
    expect(result.address?.city).toBe('Buenos Aires')
    expect(result.address?.postalCode).toBe('C1043')
    expect(result.address?.region).toBe('CABA')
    expect(result.address?.country).toBe('AR')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
