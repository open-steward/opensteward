import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type DebitoorContact } from '../../../../../../../src/verticals/accounting/adapters/debitoor/transform/contact'

function makeContact(overrides: Partial<DebitoorContact> = {}): DebitoorContact {
  return {
    id: 'con-001',
    name: 'Innovation Labs S.L.',
    ciNumber: 'B77889900',
    email: 'info@innovlabs.es',
    phone: '+34 91 567 8901',
    address: 'Calle Alcalá 150',
    city: 'Madrid',
    zipCode: '28009',
    countryCode: 'ES',
    isCustomer: true,
    isSupplier: false,
    isActive: true,
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformContact (debitoor)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('con-001')
    expect(result.name).toBe('Innovation Labs S.L.')
    expect(result.identification).toBe('B77889900')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email and phone', () => {
    const result = transformContact(makeContact())
    expect(result.emails?.[0]).toEqual({ email: 'info@innovlabs.es', type: 'WORK' })
    expect(result.telephones?.[0]?.telephone).toBe('+34 91 567 8901')
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.city).toBe('Madrid')
    expect(result.billingAddress?.country).toBe('ES')
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
