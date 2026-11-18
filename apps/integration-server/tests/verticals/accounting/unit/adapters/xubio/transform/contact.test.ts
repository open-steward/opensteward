import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type XubioContact } from '../../../../../../../src/verticals/accounting/adapters/xubio/transform/contact'

function makeContact(overrides: Partial<XubioContact> = {}): XubioContact {
  return {
    id: 300,
    razonSocial: 'Empresa SA',
    cuit: '30-71234567-9',
    email: 'contacto@empresa.com',
    telefono: '+54 11 5555-0001',
    direccion: 'Av. Corrientes 1234',
    ciudad: 'Buenos Aires',
    codigoPostal: 'C1043',
    provincia: 'CABA',
    pais: 'AR',
    moneda: 'ARS',
    esCliente: true,
    esProveedor: false,
    activo: true,
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('300')
    expect(result.name).toBe('Empresa SA')
    expect(result.identification).toBe('30-71234567-9')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
    expect(result.currency).toBe('ARS')
  })

  it('passes raw object as metadata', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps email to emails array', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toBeDefined()
    expect(result.emails![0].email).toBe('contacto@empresa.com')
  })

  it('maps telefono to telephones array', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toBeDefined()
    expect(result.telephones![0].telephone).toBe('+54 11 5555-0001')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('maps address fields to billingAddress', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress).toBeDefined()
  })

  it('returns undefined name when razonSocial is empty', () => {
    const result = transformContact(makeContact({ razonSocial: '' }))
    expect(result.name).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
