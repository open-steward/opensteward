import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type AccountEdgeContact,
} from '../../../../../../../src/verticals/accounting/adapters/accountedge/transform/contact'

function makeContact(overrides: Partial<AccountEdgeContact> = {}): AccountEdgeContact {
  return {
    id: 'ct-001',
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+1-555-1234',
    company_name: 'Acme Corp',
    is_customer: true,
    is_supplier: false,
    address: {
      line1: '123 Main St',
      city: 'Springfield',
      state: 'IL',
      zip: '62701',
      country: 'US',
    },
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id from raw id', () => {
    expect(transformContact(makeContact()).id).toBe('ct-001')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Jane Doe')
  })

  it('maps company_name to companyName', () => {
    expect(transformContact(makeContact()).companyName).toBe('Acme Corp')
  })

  it('maps is_customer to isCustomer', () => {
    expect(transformContact(makeContact()).isCustomer).toBe(true)
  })

  it('maps is_supplier to isSupplier', () => {
    expect(transformContact(makeContact()).isSupplier).toBe(false)
  })

  it('sets isActive to true', () => {
    expect(transformContact(makeContact()).isActive).toBe(true)
  })

  it('maps email to emails array', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toBeDefined()
    expect(result.emails!.length).toBeGreaterThan(0)
    expect(result.emails![0].email).toBe('jane@example.com')
  })

  it('maps phone to telephones array', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toBeDefined()
    expect(result.telephones!.length).toBeGreaterThan(0)
  })

  it('maps address to billingAddress', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress).toBeDefined()
    expect(result.billingAddress!.address1).toBe('123 Main St')
    expect(result.billingAddress!.city).toBe('Springfield')
    expect(result.billingAddress!.region).toBe('IL')
    expect(result.billingAddress!.postalCode).toBe('62701')
    expect(result.billingAddress!.country).toBe('US')
  })

  it('returns undefined billingAddress when address is null', () => {
    expect(transformContact(makeContact({ address: null })).billingAddress).toBeUndefined()
  })

  it('returns undefined name when name is empty', () => {
    expect(transformContact(makeContact({ name: '' })).name).toBeUndefined()
  })

  it('returns undefined companyName when company_name is empty', () => {
    expect(transformContact(makeContact({ company_name: '' })).companyName).toBeUndefined()
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
