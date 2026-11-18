import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type DaneaCliente } from '../../../../../../../src/verticals/accounting/adapters/danea/transform/contact'

function makeContact(overrides: Partial<DaneaCliente> = {}): DaneaCliente {
  return {
    id: '1',
    RagioneSociale: 'Test Srl',
    PartitaIva: 'IT01234567890',
    CodiceFiscale: 'TSTSRL00A00Z000A',
    Email: 'info@test.it',
    Telefono: '+39 02 1234567',
    Indirizzo: 'Via Dante 1',
    Citta: 'Torino',
    Cap: '10100',
    Provincia: 'TO',
    Paese: 'IT',
    Valuta: 'EUR',
    Attivo: true,
    Tipo: 'Cliente',
    ...overrides,
  }
}

describe('transformContact (danea)', () => {
  it('maps core fields', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Test Srl')
    expect(result.taxNumber).toBe('IT01234567890')
  })

  it('sets isCustomer for Cliente', () => {
    const c = transformContact(makeContact({ Tipo: 'Cliente' }))
    expect(c.isCustomer).toBe(true)
    expect(c.isSupplier).toBe(false)
  })

  it('sets isSupplier for Fornitore', () => {
    const c = transformContact(makeContact({ Tipo: 'Fornitore' }))
    expect(c.isSupplier).toBe(true)
    expect(c.isCustomer).toBe(false)
  })

  it('maps email', () => {
    const c = transformContact(makeContact())
    expect(c.emails?.[0]?.email).toBe('info@test.it')
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
