import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type CraterContactBusiness,
} from '../../../../../../../src/verticals/accounting/adapters/crater/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeContact(overrides: Partial<CraterContactBusiness> = {}): CraterContactBusiness {
  return {
    id: 'biz-42',
    name: 'Acme Corp',
    email: 'billing@acme.example',
    contact_first_name: 'Jane',
    contact_last_name: 'Doe',
    phone: '+15550001111',
    is_customer: true,
    is_vendor: false,
    archived: false,
    ...overrides,
  }
}

describe('transformContact (crater)', () => {
  it('maps id and name', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('biz-42')
    expect(result.name).toBe('Acme Corp')
  })

  it('maps first and last name', () => {
    const result = transformContact(makeContact())
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
  })

  it('defaults role to customer → isCustomer true', () => {
    expect(transformContact(makeContact()).isCustomer).toBe(true)
  })

  it('vendor role → isSupplier true', () => {
    expect(transformContact(makeContact(), 'vendor').isSupplier).toBe(true)
  })

  it('archived=false → isActive true', () => {
    expect(transformContact(makeContact({ archived: false })).isActive).toBe(true)
  })

  it('archived=null → isActive true', () => {
    // null is treated as not archived (active)
    expect(transformContact(makeContact({ archived: undefined })).isActive).toBe(true)
  })

  it('archived=true → isActive false', () => {
    expect(transformContact(makeContact({ archived: true })).isActive).toBe(false)
  })

  it('maps email as WORK email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toBeDefined()
    expect(result.emails![0].email).toBe('billing@acme.example')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone as WORK telephone', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toBeDefined()
    expect(result.telephones![0].telephone).toBe('+15550001111')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('maps billing address fields', () => {
    const result = transformContact(
      makeContact({
        billing_address: {
          street_1: '123 Main St',
          city: 'Springfield',
          state: 'IL',
          zip: '62701',
        },
      }),
    )
    expect(result.billingAddress?.address1).toBe('123 Main St')
    expect(result.billingAddress?.city).toBe('Springfield')
    expect(result.billingAddress?.region).toBe('IL')
    expect(result.billingAddress?.postalCode).toBe('62701')
  })

  it('omits billing address if all sub-fields are empty', () => {
    const result = transformContact(makeContact({ billing_address: {} }))
    expect(result.billingAddress).toBeUndefined()
  })

  it('attaches raw as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('passes ContactSchema.parse without throwing', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
