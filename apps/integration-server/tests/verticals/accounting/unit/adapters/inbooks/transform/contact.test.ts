import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type InbooksContact,
} from '../../../../../../../src/verticals/accounting/adapters/inbooks/transform/contact'

function makeContact(overrides: Partial<InbooksContact> = {}): InbooksContact {
  return {
    id: 88,
    name: 'Bygg & Teknik AB',
    email: 'kontakt@bygg.se',
    phone: '+46703344556',
    billing_address: 'Verkstadsgatan 20',
    city: 'Uppsala',
    zip: '751 83',
    country: 'SE',
    org_number: '556321-9876',
    is_customer: true,
    is_vendor: false,
    ...overrides,
  }
}

describe('transformContact (Inbooks)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('88')
    expect(result.name).toBe('Bygg & Teknik AB')
    expect(result.identification).toBe('556321-9876')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
  })

  it('maps email to emails array', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('kontakt@bygg.se')
  })

  it('maps billing_address fields', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('Verkstadsgatan 20')
    expect(result.billingAddress?.city).toBe('Uppsala')
    expect(result.billingAddress?.postalCode).toBe('751 83')
    expect(result.billingAddress?.country).toBe('SE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps is_vendor to isSupplier', () => {
    expect(transformContact(makeContact({ is_vendor: true })).isSupplier).toBe(true)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
