import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type CegidContact } from '../../../../../../../src/verticals/accounting/adapters/cegid/transform/contact'

function makeContact(overrides: Partial<CegidContact> = {}): CegidContact {
  return {
    id: '8',
    name: 'Bernard SAS',
    registrationNumber: '12345678900012',
    vatNumber: 'FR12345678900',
    email: 'bernard@example.fr',
    phone: '0456789012',
    addressLine1: '20 Avenue Montaigne',
    postalCode: '75008',
    city: 'Paris',
    country: 'FR',
    isCustomer: true,
    isSupplier: false,
    isActive: true,
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps core fields', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('8')
    expect(result.name).toBe('Bernard SAS')
    expect(result.isCustomer).toBe(true)
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('20 Avenue Montaigne')
    expect(result.billingAddress?.city).toBe('Paris')
  })

  it('metadata identity', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
