import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type Fatture24Anagrafica } from '../../../../../../../src/verticals/accounting/adapters/fatture24/transform/contact'

function makeContact(overrides: Partial<Fatture24Anagrafica> = {}): Fatture24Anagrafica {
  return {
    id: 'C-001',
    RagioneSociale: 'Test Srl', PartitaIva: 'IT01234567890', CodiceFiscale: 'TST', Email: 'info@test.it', Telefono: '+39', Indirizzo: 'Via Roma 1', Citta: 'Milano', Cap: '20100', Provincia: 'MI', Paese: 'IT', Valuta: 'EUR', Attivo: true, Tipo: 'cliente',
    ...overrides,
  }
}

describe('transformContact (fatture24)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('C-001')
  })

  it('maps email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toBeDefined()
    expect(result.emails![0]?.email).toBe('info@test.it')
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress).toBeDefined()
    expect(result.billingAddress?.city).toBe('Milano')
  })

  it('passes raw as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
