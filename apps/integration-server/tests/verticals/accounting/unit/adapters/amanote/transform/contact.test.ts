import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type AmanoteContact } from '../../../../../../../src/verticals/accounting/adapters/amanote/transform/contact'

function makeContact(overrides: Partial<AmanoteContact> = {}): AmanoteContact {
  return {
    id: 'cust-1',
    name: 'Mustermann GmbH',
    email: 'info@mustermann.de',
    phone: '+49 89 123456',
    street: 'Musterstraße 1',
    city: 'München',
    postal_code: '80331',
    country: 'DE',
    vat_number: 'DE123456789',
    is_customer: true,
    is_supplier: false,
    active: true,
    ...overrides,
  }
}

describe('transformContact (Amanote)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('cust-1')
    expect(result.name).toBe('Mustermann GmbH')
    expect(result.identification).toBe('DE123456789')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.city).toBe('München')
    expect(result.billingAddress?.country).toBe('DE')
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
