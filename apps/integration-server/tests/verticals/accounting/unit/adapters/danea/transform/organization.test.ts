import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type DaneaAzienda } from '../../../../../../../src/verticals/accounting/adapters/danea/transform/organization'

function makeOrg(overrides: Partial<DaneaAzienda> = {}): DaneaAzienda {
  return {
    RagioneSociale: 'My Company Srl',
    PartitaIva: 'IT09876543210',
    CodiceFiscale: 'MYCSRL00A00Z000A',
    Indirizzo: 'Via Milano 10',
    Citta: 'Roma',
    Cap: '00100',
    Provincia: 'RM',
    Paese: 'IT',
    Email: 'info@mycompany.it',
    Telefono: '+39 06 12345678',
    SitoWeb: 'https://www.mycompany.it',
    Valuta: 'EUR',
    ...overrides,
  }
}

describe('transformOrganization (danea)', () => {
  it('maps core fields', () => {
    const result = transformOrganization(makeOrg())
    expect(result.name).toBe('My Company Srl')
    expect(result.taxNumber).toBe('IT09876543210')
    expect(result.currency).toBe('EUR')
  })

  it('maps address', () => {
    const result = transformOrganization(makeOrg())
    expect(result.address?.address1).toBe('Via Milano 10')
    expect(result.address?.city).toBe('Roma')
    expect(result.address?.region).toBe('RM')
  })

  it('passes raw as metadata', () => {
    const raw = makeOrg()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
