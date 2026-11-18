import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type ContasimpleContact } from '../../../../../../../src/verticals/accounting/adapters/contasimple/transform/contact'

function makeContact(overrides: Partial<ContasimpleContact> = {}): ContasimpleContact {
  return {
    id: 'con-001',
    nombre: 'Distribuciones García S.L.',
    nif: 'B22334455',
    email: 'contacto@garcia.es',
    telefono: '+34 93 456 7890',
    direccion: 'Avenida Diagonal 200',
    ciudad: 'Barcelona',
    codigo_postal: '08021',
    pais: 'ES',
    provincia: 'Barcelona',
    es_cliente: true,
    es_proveedor: false,
    activo: true,
    moneda: 'EUR',
    ...overrides,
  }
}

describe('transformContact (contasimple)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('con-001')
    expect(result.name).toBe('Distribuciones García S.L.')
    expect(result.identification).toBe('B22334455')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email and phone', () => {
    const result = transformContact(makeContact())
    expect(result.emails?.[0]).toEqual({ email: 'contacto@garcia.es', type: 'WORK' })
    expect(result.telephones?.[0]).toEqual({ telephone: '+34 93 456 7890', type: 'WORK' })
  })

  it('maps billing address with region', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.city).toBe('Barcelona')
    expect(result.billingAddress?.region).toBe('Barcelona')
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
