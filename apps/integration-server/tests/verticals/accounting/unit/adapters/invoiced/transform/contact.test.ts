import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type InvoicedCustomer,
} from '../../../../../../../src/verticals/accounting/adapters/invoiced/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeCustomer(overrides: Partial<InvoicedCustomer> = {}): InvoicedCustomer {
  return {
    id: 42,
    object: 'customer',
    name: 'Acme Corp',
    number: 'ACME-001',
    email: 'billing@acme.example',
    type: 'company',
    country: 'US',
    address1: '123 Main St',
    address2: 'Suite 100',
    city: 'San Francisco',
    state: 'CA',
    postal_code: '94105',
    phone: '+14155550100',
    attention_to: null,
    tax_id: 'US-123456789',
    taxable: true,
    currency: 'usd',
    payment_terms: 'Net 30',
    autopay: false,
    credit_hold: false,
    notes: null,
    portal_url: 'https://app.example.com/portal/42',
    metadata: {},
    created_at: 1700000000,
    updated_at: 1700100000,
    ...overrides,
  }
}

describe('transformContact', () => {
  it('converts numeric id to string', () => {
    const result = transformContact(makeCustomer({ id: 42 }))
    expect(result.id).toBe('42')
  })

  it('maps name', () => {
    const result = transformContact(makeCustomer({ name: 'Acme Corp' }))
    expect(result.name).toBe('Acme Corp')
  })

  it('sets companyName when type is company', () => {
    const result = transformContact(makeCustomer({ type: 'company', name: 'Acme Corp' }))
    expect(result.companyName).toBe('Acme Corp')
  })

  it('leaves companyName undefined when type is not company', () => {
    const result = transformContact(makeCustomer({ type: 'individual' }))
    expect(result.companyName).toBeUndefined()
  })

  it('maps number to identification', () => {
    const result = transformContact(makeCustomer({ number: 'ACME-001' }))
    expect(result.identification).toBe('ACME-001')
  })

  it('maps tax_id to taxNumber', () => {
    const result = transformContact(makeCustomer({ tax_id: 'US-123456789' }))
    expect(result.taxNumber).toBe('US-123456789')
  })

  it('sets isCustomer true and isSupplier false', () => {
    const result = transformContact(makeCustomer())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('sets isActive to true when credit_hold is false', () => {
    expect(transformContact(makeCustomer({ credit_hold: false })).isActive).toBe(true)
  })

  it('sets isActive to false when credit_hold is true', () => {
    expect(transformContact(makeCustomer({ credit_hold: true })).isActive).toBe(false)
  })

  it('uppercases currency', () => {
    const result = transformContact(makeCustomer({ currency: 'usd' }))
    expect(result.currency).toBe('USD')
  })

  it('maps email to WORK email', () => {
    const result = transformContact(makeCustomer({ email: 'billing@acme.example' }))
    expect(result.emails?.[0]).toEqual({ email: 'billing@acme.example', type: 'WORK' })
  })

  it('maps phone to WORK telephone', () => {
    const result = transformContact(makeCustomer({ phone: '+14155550100' }))
    expect(result.telephones?.[0]).toEqual({ telephone: '+14155550100', type: 'WORK' })
  })

  it('omits telephones when phone is null', () => {
    const result = transformContact(makeCustomer({ phone: null }))
    expect(result.telephones).toBeUndefined()
  })

  it('maps billing address fields', () => {
    const result = transformContact(makeCustomer())
    expect(result.billingAddress?.address1).toBe('123 Main St')
    expect(result.billingAddress?.city).toBe('San Francisco')
    expect(result.billingAddress?.region).toBe('CA')
    expect(result.billingAddress?.postalCode).toBe('94105')
    expect(result.billingAddress?.country).toBe('US')
  })

  it('maps portal_url', () => {
    const result = transformContact(
      makeCustomer({ portal_url: 'https://app.example.com/portal/42' }),
    )
    expect(result.portalUrl).toBe('https://app.example.com/portal/42')
  })

  it('converts epoch seconds to Date for createdAt and updatedAt', () => {
    const result = transformContact(
      makeCustomer({ created_at: 1700000000, updated_at: 1700100000 }),
    )
    expect(result.createdAt).toEqual(new Date(1700000000 * 1000))
    expect(result.updatedAt).toEqual(new Date(1700100000 * 1000))
  })

  it('passes raw object as metadata', () => {
    const raw = makeCustomer()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('passes ContactSchema validation', () => {
    const result = transformContact(makeCustomer())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
