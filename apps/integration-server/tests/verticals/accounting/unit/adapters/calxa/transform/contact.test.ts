import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type CalxaContact,
} from '../../../../../../../src/verticals/accounting/adapters/calxa/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeContact(overrides: Partial<CalxaContact> = {}): CalxaContact {
  return {
    id: 'contact-001',
    name: 'Acme Corp',
    emailAddress: 'billing@acme.com',
    phone: '+1-555-0100',
    isCustomer: true,
    isSupplier: false,
    isActive: true,
    currency: 'USD',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id as-is', () => {
    expect(transformContact(makeContact()).id).toBe('contact-001')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Acme Corp')
  })

  it('maps isCustomer', () => {
    expect(transformContact(makeContact()).isCustomer).toBe(true)
  })

  it('maps isSupplier', () => {
    expect(transformContact(makeContact()).isSupplier).toBe(false)
  })

  it('maps isActive', () => {
    expect(transformContact(makeContact()).isActive).toBe(true)
  })

  it('maps currency', () => {
    expect(transformContact(makeContact()).currency).toBe('USD')
  })

  it('maps taxNumber', () => {
    expect(transformContact(makeContact({ taxNumber: 'US-12345' })).taxNumber).toBe('US-12345')
  })

  it('maps emailAddress to emails array', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toBeDefined()
    expect(result.emails!.length).toBeGreaterThan(0)
    expect(result.emails![0].email).toBe('billing@acme.com')
  })

  it('maps phone to telephones with type WORK', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toBeDefined()
    expect(result.telephones!.length).toBeGreaterThan(0)
    expect(result.telephones![0].telephone).toBe('+1-555-0100')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('returns empty telephones when phone is undefined', () => {
    const result = transformContact(makeContact({ phone: undefined }))
    expect(result.telephones).toBeUndefined()
  })

  it('maps BILLING address to billingAddress', () => {
    const result = transformContact(
      makeContact({
        addresses: [
          {
            type: 'BILLING',
            line1: '123 Main St',
            city: 'Springfield',
            region: 'IL',
            postalCode: '62701',
            country: 'US',
          },
        ],
      }),
    )
    expect(result.billingAddress).toBeDefined()
    expect(result.billingAddress!.address1).toBe('123 Main St')
    expect(result.billingAddress!.city).toBe('Springfield')
  })

  it('maps DELIVERY address to shippingAddress', () => {
    const result = transformContact(
      makeContact({
        addresses: [
          {
            type: 'DELIVERY',
            line1: '456 Oak Ave',
            city: 'Chicago',
            country: 'US',
          },
        ],
      }),
    )
    expect(result.shippingAddress).toBeDefined()
    expect(result.shippingAddress!.address1).toBe('456 Oak Ave')
  })

  it('returns undefined billingAddress when no matching address', () => {
    const result = transformContact(makeContact({ addresses: [] }))
    expect(result.billingAddress).toBeUndefined()
  })

  it('maps createdAt to Date', () => {
    const result = transformContact(makeContact({ createdAt: '2024-01-15T09:30:00Z' }))
    expect(result.createdAt).toEqual(new Date('2024-01-15T09:30:00Z'))
  })

  it('maps updatedAt to Date', () => {
    const result = transformContact(makeContact({ updatedAt: '2024-02-01T14:20:00Z' }))
    expect(result.updatedAt).toEqual(new Date('2024-02-01T14:20:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => ContactSchema.parse(transformContact(makeContact()))).not.toThrow()
  })
})
