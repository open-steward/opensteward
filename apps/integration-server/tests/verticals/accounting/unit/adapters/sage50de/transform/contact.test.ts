import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type Sage50DeContact } from '../../../../../../../src/verticals/accounting/adapters/sage50de/transform/contact'

function makeContact(overrides: Partial<Sage50DeContact> = {}): Sage50DeContact {
  return {
    id: 'cust-1',
    displayed_as: 'Mustermann GmbH',
    email: 'info@mustermann.de',
    telephone: '+49 89 123456',
    main_address: {
      address_line_1: 'Musterstraße 1',
      city: 'München',
      postal_code: '80331',
      region: 'Bayern',
      country: 'DE',
    },
    tax_number: 'DE123456789',
    is_customer: true,
    is_supplier: false,
    active: true,
    ...overrides,
  }
}

describe('transformContact (Sage 50 DE)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('cust-1')
    expect(result.name).toBe('Mustermann GmbH')
    expect(result.identification).toBe('DE123456789')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps address from main_address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('Musterstraße 1')
    expect(result.billingAddress?.city).toBe('München')
    expect(result.billingAddress?.region).toBe('Bayern')
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
