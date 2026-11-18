import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type SiigoContact } from '../../../../../../../src/verticals/accounting/adapters/siigo/transform/contact'

function makeContact(overrides: Partial<SiigoContact> = {}): SiigoContact {
  return {
    id: 300,
    name: 'Juan Perez',
    identification: '900123456-7',
    commercialName: 'Empresa ABC',
    branchOffice: 'Bogota',
    active: true,
    contactType: 'customer',
    email: 'juan@empresa.co',
    phone: '6011234567',
    cellPhone: '3101234567',
    address: 'Calle 100 #15-20',
    city: 'Bogota',
    state: 'Cundinamarca',
    postalCode: '110111',
    country: 'CO',
    currency: 'COP',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('300')
    expect(result.name).toBe('Empresa ABC')
    expect(result.identification).toBe('900123456-7')
    expect(result.isActive).toBe(true)
    expect(result.currency).toBe('COP')
  })

  it('sets isCustomer and isSupplier based on contactType', () => {
    const customer = transformContact(makeContact({ contactType: 'customer' }))
    expect(customer.isCustomer).toBe(true)
    expect(customer.isSupplier).toBe(false)

    const supplier = transformContact(makeContact({ contactType: 'supplier' }))
    expect(supplier.isCustomer).toBe(false)
    expect(supplier.isSupplier).toBe(true)
  })

  it('maps telephones', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(2)
    expect(result.telephones![0]).toEqual({ telephone: '6011234567', type: 'WORK' })
    expect(result.telephones![1]).toEqual({ telephone: '3101234567', type: 'MOBILE' })
  })

  it('falls back to name when commercialName is empty', () => {
    const result = transformContact(makeContact({ commercialName: '' }))
    expect(result.name).toBe('Juan Perez')
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
