import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type FactusolContact } from '../../../../../../../src/verticals/accounting/adapters/factusol/transform/contact'

function makeContact(overrides: Partial<FactusolContact> = {}): FactusolContact {
  return {
    id: 'con-001',
    nombre: 'Manufacturas Españolas S.A.',
    nif: 'A87654321',
    email: 'info@manufacturasespanolas.es',
    telefono: '+34 91 345 6789',
    direccion: 'Polígono Industrial Norte, Nave 5',
    ciudad: 'Zaragoza',
    codigo_postal: '50013',
    pais: 'ES',
    provincia: 'Aragón',
    es_cliente: true,
    es_proveedor: false,
    activo: true,
    divisa: 'EUR',
    ...overrides,
  }
}

describe('transformContact (factusol)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('con-001')
    expect(result.name).toBe('Manufacturas Españolas S.A.')
    expect(result.identification).toBe('A87654321')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email and phone', () => {
    const result = transformContact(makeContact())
    expect(result.emails?.[0]).toEqual({ email: 'info@manufacturasespanolas.es', type: 'WORK' })
    expect(result.telephones?.[0]?.telephone).toBe('+34 91 345 6789')
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.city).toBe('Zaragoza')
    expect(result.billingAddress?.region).toBe('Aragón')
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
