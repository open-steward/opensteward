import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type ContabiliumContact } from '../../../../../../../src/verticals/accounting/adapters/contabilium/transform/contact'

function makeContact(overrides: Partial<ContabiliumContact> = {}): ContabiliumContact {
  return {
    id: 15,
    razonSocial: 'Empresa Argentina S.A.',
    cuit: '30-12345678-9',
    email: 'info@empresa.com.ar',
    telefono: '011-4123-4567',
    direccion: 'Av. Corrientes 1234',
    localidad: 'Buenos Aires',
    provincia: 'Buenos Aires',
    codigoPostal: 'C1043',
    pais: 'AR',
    activo: true,
    esCliente: true,
    esProveedor: false,
    moneda: 'ARS',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeContact()).id).toBe('15')
  })

  it('maps razonSocial to name', () => {
    expect(transformContact(makeContact()).name).toBe('Empresa Argentina S.A.')
  })

  it('maps cuit to identification', () => {
    expect(transformContact(makeContact()).identification).toBe('30-12345678-9')
  })

  it('maps esCliente to isCustomer', () => {
    expect(transformContact(makeContact({ esCliente: true })).isCustomer).toBe(true)
  })

  it('maps esProveedor to isSupplier', () => {
    expect(transformContact(makeContact({ esProveedor: true })).isSupplier).toBe(true)
  })

  it('maps activo to isActive', () => {
    expect(transformContact(makeContact({ activo: true })).isActive).toBe(true)
    expect(transformContact(makeContact({ activo: false })).isActive).toBe(false)
  })

  it('maps email', () => {
    const c = transformContact(makeContact())
    expect(c.emails?.[0]).toEqual({ email: 'info@empresa.com.ar', type: 'WORK' })
  })

  it('maps telefono as WORK telephone', () => {
    const c = transformContact(makeContact())
    expect(c.telephones?.[0]).toEqual({ telephone: '011-4123-4567', type: 'WORK' })
  })

  it('maps billing address', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('Av. Corrientes 1234')
    expect(c.billingAddress?.city).toBe('Buenos Aires')
    expect(c.billingAddress?.postalCode).toBe('C1043')
    expect(c.billingAddress?.country).toBe('AR')
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
