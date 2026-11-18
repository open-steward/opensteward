import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type BuchhaltungsButzeContact } from '../../../../../../../src/verticals/accounting/adapters/buchhaltungsbutze/transform/contact'

function makeContact(overrides: Partial<BuchhaltungsButzeContact> = {}): BuchhaltungsButzeContact {
  return {
    id: 'cust-1',
    company_name: 'Mustermann GmbH',
    email: 'info@mustermann.de',
    phone: '+49 89 123456',
    street: 'Musterstraße 1',
    zip: '80331',
    city: 'München',
    country: 'DE',
    tax_id: 'DE123456789',
    is_customer: true,
    is_supplier: false,
    active: true,
    ...overrides,
  }
}

describe('transformContact (BuchhaltungsButze)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('cust-1')
    expect(result.name).toBe('Mustermann GmbH')
    expect(result.identification).toBe('DE123456789')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email', () => {
    expect(transformContact(makeContact()).emails?.[0]?.email).toBe('info@mustermann.de')
  })

  it('maps address city', () => {
    expect(transformContact(makeContact()).billingAddress?.city).toBe('München')
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
