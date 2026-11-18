import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type FacturadirectaContact } from '../../../../../../../src/verticals/accounting/adapters/facturadirecta/transform/contact'

function makeContact(overrides: Partial<FacturadirectaContact> = {}): FacturadirectaContact {
  return {
    id: 'con-001',
    name: 'Proyectos Ibéricos S.A.',
    tax_id: 'A12341234',
    email: 'proyectos@ibericos.es',
    phone: '+34 91 890 1234',
    address: 'Calle de la Palma 15',
    city: 'Madrid',
    postal_code: '28015',
    country: 'ES',
    region: 'Madrid',
    is_customer: true,
    is_supplier: false,
    active: true,
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformContact (facturadirecta)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('con-001')
    expect(result.name).toBe('Proyectos Ibéricos S.A.')
    expect(result.identification).toBe('A12341234')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email and phone', () => {
    const result = transformContact(makeContact())
    expect(result.emails?.[0]).toEqual({ email: 'proyectos@ibericos.es', type: 'WORK' })
    expect(result.telephones?.[0]?.telephone).toBe('+34 91 890 1234')
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.city).toBe('Madrid')
    expect(result.billingAddress?.country).toBe('ES')
    expect(result.billingAddress?.region).toBe('Madrid')
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
