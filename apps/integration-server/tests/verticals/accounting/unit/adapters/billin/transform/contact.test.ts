import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type BillinContact } from '../../../../../../../src/verticals/accounting/adapters/billin/transform/contact'

function makeContact(overrides: Partial<BillinContact> = {}): BillinContact {
  return {
    id: 'con-001',
    name: 'Inversiones Rápidas S.A.',
    tax_id: 'A33445566',
    email: 'admin@inversiones.es',
    phone: '+34 96 123 4567',
    address: 'Avenida del Puerto 30',
    city: 'Valencia',
    postal_code: '46023',
    country: 'ES',
    region: 'Valencia',
    is_customer: true,
    is_supplier: true,
    active: true,
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformContact (billin)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('con-001')
    expect(result.name).toBe('Inversiones Rápidas S.A.')
    expect(result.identification).toBe('A33445566')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(true)
  })

  it('maps email and phone', () => {
    const result = transformContact(makeContact())
    expect(result.emails?.[0]).toEqual({ email: 'admin@inversiones.es', type: 'WORK' })
    expect(result.telephones?.[0]?.telephone).toBe('+34 96 123 4567')
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.city).toBe('Valencia')
    expect(result.billingAddress?.region).toBe('Valencia')
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
