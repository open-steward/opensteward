import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type ArubaAzienda } from '../../../../../../../src/verticals/accounting/adapters/aruba/transform/organization'

function makeOrg(overrides: Partial<ArubaAzienda> = {}): ArubaAzienda {
  return {
    ragione_sociale: 'My Company Srl',
    partita_iva: 'IT09876543210',
    codice_fiscale: 'MYCSRL00A00Z000A',
    indirizzo: 'Via Milano 10',
    citta: 'Roma',
    cap: '00100',
    provincia: 'RM',
    paese: 'IT',
    email: 'info@mycompany.it',
    telefono: '+39 06 12345678',
    sito_web: 'https://www.mycompany.it',
    valuta: 'EUR',
    ...overrides,
  }
}

describe('transformOrganization (aruba)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrg())
    expect(result.name).toBe('My Company Srl')
    expect(result.legalName).toBe('My Company Srl')
    expect(result.taxNumber).toBe('IT09876543210')
    expect(result.currency).toBe('EUR')
    expect(result.website).toBe('https://www.mycompany.it')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrg())
    expect(result.address?.address1).toBe('Via Milano 10')
    expect(result.address?.city).toBe('Roma')
    expect(result.address?.postalCode).toBe('00100')
    expect(result.address?.region).toBe('RM')
    expect(result.address?.country).toBe('IT')
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrg()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const raw = makeOrg({ sito_web: '', valuta: '' })
    const result = transformOrganization(raw)
    expect(result.website).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
