import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type KlaraContact,
} from '../../../../../../../src/verticals/accounting/adapters/klara/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeContact(overrides: Partial<KlaraContact> = {}): KlaraContact {
  return {
    id: 'cont-1',
    contact_type: 'company',
    company_name: 'Acme AG',
    is_customer: true,
    is_supplier: false,
    is_active: true,
    currency: 'CHF',
    email: 'info@acme.ch',
    phone: '+41441234567',
    address: 'Bahnhofstrasse 1',
    zip: '8001',
    city: 'Zürich',
    country: 'CH',
    created_at: '2024-01-15T00:00:00.000Z',
    updated_at: '2024-02-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps company fields', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('cont-1')
    expect(result.name).toBe('Acme AG')
    expect(result.companyName).toBe('Acme AG')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.currency).toBe('CHF')
  })

  it('maps person name from first_name + last_name', () => {
    const result = transformContact(
      makeContact({
        contact_type: 'person',
        first_name: 'Hans',
        last_name: 'Müller',
        company_name: undefined,
      }),
    )
    expect(result.name).toBe('Hans Müller')
    expect(result.firstName).toBe('Hans')
    expect(result.lastName).toBe('Müller')
    expect(result.companyName).toBeUndefined()
  })

  it('maps email to emails array', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toBeDefined()
    expect(result.emails![0].email).toBe('info@acme.ch')
  })

  it('maps billing address fields', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('Bahnhofstrasse 1')
    expect(result.billingAddress?.postalCode).toBe('8001')
    expect(result.billingAddress?.city).toBe('Zürich')
    expect(result.billingAddress?.country).toBe('CH')
  })

  it('maps isActive correctly', () => {
    expect(transformContact(makeContact({ is_active: true })).isActive).toBe(true)
    expect(transformContact(makeContact({ is_active: false })).isActive).toBe(false)
  })

  it('parses dates as Date objects', () => {
    const result = transformContact(makeContact())
    expect(result.createdAt).toEqual(new Date('2024-01-15T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-02-01T00:00:00.000Z'))
  })

  it('passes schema validation', () => {
    expect(() => ContactSchema.parse(transformContact(makeContact()))).not.toThrow()
  })
})
