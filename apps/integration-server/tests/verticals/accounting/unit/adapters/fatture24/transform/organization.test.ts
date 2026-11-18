import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type Fatture24Azienda } from '../../../../../../../src/verticals/accounting/adapters/fatture24/transform/organization'

function makeOrg(overrides: Partial<Fatture24Azienda> = {}): Fatture24Azienda {
  return {
    RagioneSociale: 'My Company', PartitaIva: 'IT09876543210', Indirizzo: 'Via Roma 1', Citta: 'Roma', Cap: '00100', Provincia: 'RM', Paese: 'IT', Email: 'info@mc.it', Telefono: '+39', SitoWeb: 'https://mc.it', Valuta: 'EUR',
    ...overrides,
  }
}

describe('transformOrganization (fatture24)', () => {
  it('maps core fields', () => {
    const result = transformOrganization(makeOrg())
    expect(result.name).toBe('My Company')
    expect(result.currency).toBe('EUR')
  })

  it('maps address', () => {
    const result = transformOrganization(makeOrg())
    expect(result.address).toBeDefined()
    expect(result.address?.city).toBe('Roma')
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
