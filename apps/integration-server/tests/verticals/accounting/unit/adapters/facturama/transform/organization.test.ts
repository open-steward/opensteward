import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type FacturamaCompanyInfo } from '../../../../../../../src/verticals/accounting/adapters/facturama/transform/organization'

function makeRaw(overrides: Partial<FacturamaCompanyInfo> = {}): FacturamaCompanyInfo {
  return {
    TaxName: 'Mi Empresa',
    LegalName: 'Mi Empresa SA de CV',
    Rfc: 'MEX010101ABC',
    TaxRegime: '601',
    Email: 'info@empresa.mx',
    Phone: '5551234567',
    Website: 'https://empresa.mx',
    CurrencyCode: 'MXN',
    Address: {
      Street: 'Reforma',
      ExteriorNumber: '1',
      InteriorNumber: '',
      Neighborhood: 'Centro',
      ZipCode: '06600',
      Municipality: 'CDMX',
      State: 'CDMX',
      Country: 'MX',
    },
    ...overrides,
  }
}

describe('facturama transformOrganization', () => {
  it('maps TaxName to name', () => {
    expect(transformOrganization(makeRaw()).name).toBe('Mi Empresa')
  })
  it('handles fields gracefully', () => {
    expect(() => transformOrganization(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })
  it('maps Rfc to taxNumber', () => {
    expect(transformOrganization(makeRaw()).taxNumber).toBe('MEX010101ABC')
  })
  it('maps LegalName to legalName', () => {
    expect(transformOrganization(makeRaw()).legalName).toBe('Mi Empresa SA de CV')
  })
  it('maps CurrencyCode to currency', () => {
    expect(transformOrganization(makeRaw()).currency).toBe('MXN')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
