import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type BmanAnagrafica } from '../../../../../../../src/verticals/accounting/adapters/bman/transform/contact'

function makeContact(overrides: Partial<BmanAnagrafica> = {}): BmanAnagrafica {
  return {
    id: 'C-001',
    ragione_sociale: 'Test Srl', partita_iva: 'IT01234567890', codice_fiscale: 'TST', email: 'info@test.it', telefono: '+39', indirizzo: 'Via Roma 1', citta: 'Milano', cap: '20100', provincia: 'MI', paese: 'IT', valuta: 'EUR', attivo: true, tipo: 'cliente',
    ...overrides,
  }
}

describe('transformContact (bman)', () => {
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
