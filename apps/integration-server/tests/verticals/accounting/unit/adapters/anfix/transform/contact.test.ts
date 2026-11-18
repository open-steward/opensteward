import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type AnfixContact } from '../../../../../../../src/verticals/accounting/adapters/anfix/transform/contact'

function makeContact(overrides: Partial<AnfixContact> = {}): AnfixContact {
  return {
    id: 'con-001',
    nombre: 'Empresa ABC S.L.',
    nif: 'B12345678',
    email: 'info@empresaabc.es',
    telefono: '+34 91 123 4567',
    direccion: 'Calle Mayor 10',
    ciudad: 'Madrid',
    codigo_postal: '28001',
    pais: 'ES',
    provincia: 'Madrid',
    es_cliente: true,
    es_proveedor: false,
    activo: true,
    divisa: 'EUR',
    ...overrides,
  }
}

describe('transformContact (anfix)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('con-001')
    expect(result.name).toBe('Empresa ABC S.L.')
    expect(result.identification).toBe('B12345678')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
    expect(result.currency).toBe('EUR')
  })

  it('maps email and phone', () => {
    const result = transformContact(makeContact())
    expect(result.emails?.[0]).toEqual({ email: 'info@empresaabc.es', type: 'WORK' })
    expect(result.telephones?.[0]).toEqual({ telephone: '+34 91 123 4567', type: 'WORK' })
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('Calle Mayor 10')
    expect(result.billingAddress?.city).toBe('Madrid')
    expect(result.billingAddress?.postalCode).toBe('28001')
    expect(result.billingAddress?.country).toBe('ES')
    expect(result.billingAddress?.region).toBe('Madrid')
  })

  it('passes raw object as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('handles empty email gracefully', () => {
    const result = transformContact(makeContact({ email: '' }))
    expect(result.emails).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
