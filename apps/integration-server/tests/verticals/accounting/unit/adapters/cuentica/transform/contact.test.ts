import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type CuenticaContact } from '../../../../../../../src/verticals/accounting/adapters/cuentica/transform/contact'

function makeContact(overrides: Partial<CuenticaContact> = {}): CuenticaContact {
  return {
    id: 'con-001',
    name: 'Tech Solutions S.L.',
    tax_id: 'B55667788',
    email: 'hello@techsolutions.es',
    phone: '+34 91 234 5678',
    address: 'Calle Serrano 50',
    city: 'Madrid',
    postal_code: '28006',
    country: 'ES',
    region: 'Madrid',
    is_customer: true,
    is_supplier: false,
    active: true,
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformContact (cuentica)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('con-001')
    expect(result.name).toBe('Tech Solutions S.L.')
    expect(result.identification).toBe('B55667788')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email and phone', () => {
    const result = transformContact(makeContact())
    expect(result.emails?.[0]).toEqual({ email: 'hello@techsolutions.es', type: 'WORK' })
    expect(result.telephones?.[0]?.telephone).toBe('+34 91 234 5678')
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
