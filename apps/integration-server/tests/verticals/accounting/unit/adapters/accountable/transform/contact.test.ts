import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type AccountableContact } from '../../../../../../../src/verticals/accounting/adapters/accountable/transform/contact'

function makeContact(overrides: Partial<AccountableContact> = {}): AccountableContact {
  return {
    id: 'cust-1',
    name: 'Mustermann GmbH',
    email: 'info@mustermann.de',
    phone: '+49 89 123456',
    address: {
      street: 'Musterstraße 1',
      city: 'München',
      postalCode: '80331',
      country: 'DE',
    },
    vatId: 'DE123456789',
    isClient: true,
    isSupplier: false,
    ...overrides,
  }
}

describe('transformContact (Accountable)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('cust-1')
    expect(result.name).toBe('Mustermann GmbH')
    expect(result.identification).toBe('DE123456789')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps address nested object', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.city).toBe('München')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
