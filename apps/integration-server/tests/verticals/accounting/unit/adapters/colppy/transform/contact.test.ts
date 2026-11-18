import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformCustomer,
  transformSupplier,
  type ColppyCustomer,
  type ColppySupplier,
} from '../../../../../../../src/verticals/accounting/adapters/colppy/transform/contact'

function makeCustomer(overrides: Partial<ColppyCustomer> = {}): ColppyCustomer {
  return {
    idCliente: 1,
    razonSocial: 'Empresa SRL',
    cuit: '30-71234567-8',
    email: 'info@empresa.com',
    telefono: '+54 11 5555-0001',
    fax: '+54 11 5555-0002',
    direccion: 'Av. Corrientes 1234',
    ciudad: 'Buenos Aires',
    codigoPostal: 'C1043',
    provincia: 'CABA',
    pais: 'AR',
    moneda: 'ARS',
    activo: true,
    ...overrides,
  }
}

function makeSupplier(overrides: Partial<ColppySupplier> = {}): ColppySupplier {
  return {
    idProveedor: 2,
    razonSocial: 'Distribuidora SA',
    cuit: '30-98765432-1',
    email: 'ventas@dist.com',
    telefono: '+54 11 5555-0003',
    direccion: 'Calle Falsa 123',
    ciudad: 'Rosario',
    codigoPostal: 'S2000',
    provincia: 'Santa Fe',
    pais: 'AR',
    moneda: 'ARS',
    activo: true,
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('maps core fields correctly', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('cust_1')
    expect(result.name).toBe('Empresa SRL')
    expect(result.identification).toBe('30-71234567-8')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.currency).toBe('ARS')
  })

  it('passes raw object as metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps active state', () => {
    const result = transformCustomer(makeCustomer({ activo: false }))
    expect(result.isActive).toBe(false)
  })

  it('includes phone and fax in telephones', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.telephones).toHaveLength(2)
    expect(result.telephones![0].type).toBe('WORK')
    expect(result.telephones![1].type).toBe('FAX')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier', () => {
  it('maps core fields correctly', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.id).toBe('supp_2')
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('passes raw object as metadata', () => {
    const raw = makeSupplier()
    const result = transformSupplier(raw)
    expect(result.metadata).toBe(raw)
  })
})
