import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type ArubaContatto } from '../../../../../../../src/verticals/accounting/adapters/aruba/transform/contact'

function makeContact(overrides: Partial<ArubaContatto> = {}): ArubaContatto {
  return {
    id: 'C-001',
    ragione_sociale: 'Acme Srl',
    partita_iva: 'IT01234567890',
    codice_fiscale: 'ACMSRL00A00Z000A',
    email: 'info@acme.it',
    telefono: '+39 02 12345678',
    indirizzo: 'Via Roma 1',
    citta: 'Milano',
    cap: '20100',
    provincia: 'MI',
    paese: 'IT',
    valuta: 'EUR',
    attivo: true,
    tipo: 'cliente',
    ...overrides,
  }
}

describe('transformContact (aruba)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('C-001')
    expect(result.name).toBe('Acme Srl')
    expect(result.taxNumber).toBe('IT01234567890')
    expect(result.identification).toBe('ACMSRL00A00Z000A')
    expect(result.currency).toBe('EUR')
  })

  it('sets isCustomer=true when tipo=cliente', () => {
    const c = transformContact(makeContact({ tipo: 'cliente' }))
    expect(c.isCustomer).toBe(true)
    expect(c.isSupplier).toBe(false)
  })

  it('sets isSupplier=true when tipo=fornitore', () => {
    const c = transformContact(makeContact({ tipo: 'fornitore' }))
    expect(c.isSupplier).toBe(true)
    expect(c.isCustomer).toBe(false)
  })

  it('sets both when tipo=entrambi', () => {
    const c = transformContact(makeContact({ tipo: 'entrambi' }))
    expect(c.isCustomer).toBe(true)
    expect(c.isSupplier).toBe(true)
  })

  it('maps email to work email', () => {
    const c = transformContact(makeContact())
    expect(c.emails?.[0]).toEqual({ email: 'info@acme.it', type: 'WORK' })
  })

  it('maps billing address', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('Via Roma 1')
    expect(c.billingAddress?.city).toBe('Milano')
    expect(c.billingAddress?.postalCode).toBe('20100')
    expect(c.billingAddress?.region).toBe('MI')
    expect(c.billingAddress?.country).toBe('IT')
  })

  it('passes raw object as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
