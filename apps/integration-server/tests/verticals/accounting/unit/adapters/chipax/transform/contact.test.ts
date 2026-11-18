import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type ChipaxContact } from '../../../../../../../src/verticals/accounting/adapters/chipax/transform/contact'

function makeContact(overrides: Partial<ChipaxContact> = {}): ChipaxContact {
  return {
    id: 1,
    nombre: 'Empresa SpA',
    rut: '76.123.456-7',
    email: 'contacto@empresa.cl',
    telefono: '+56912345678',
    direccion: 'Av. Providencia 1234',
    ciudad: 'Santiago',
    comuna: 'Providencia',
    pais: 'CL',
    activo: true,
    esCliente: true,
    esProveedor: false,
    moneda: 'CLP',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Empresa SpA')
    expect(result.identification).toBe('76.123.456-7')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
    expect(result.currency).toBe('CLP')
  })

  it('maps telephone', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toEqual([{ telephone: '+56912345678', type: 'WORK' }])
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress).toBeDefined()
    expect(result.billingAddress?.city).toBe('Santiago')
  })

  it('passes raw object as metadata', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined name when nombre is empty', () => {
    const result = transformContact(makeContact({ nombre: '' }))
    expect(result.name).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
