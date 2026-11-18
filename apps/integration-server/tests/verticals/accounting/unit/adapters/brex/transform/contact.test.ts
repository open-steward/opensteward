import { describe, it, expect } from 'vitest'
import {
  transformVendor,
  untransformVendor,
  type BrexVendor,
} from '../../../../../../../src/verticals/accounting/adapters/brex/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import type { Contact } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeVendor(overrides: Partial<BrexVendor> = {}): BrexVendor {
  return {
    id: 'vendor_001',
    company_name: 'Acme Corp',
    email: 'billing@acme.com',
    phone: '+14155551234',
    payment_accounts: [
      {
        type: 'ACH',
        payment_instrument_id: 'pi_001',
        routing_number: '021000021',
        account_number: '999888777',
      },
    ],
    ...overrides,
  }
}

describe('transformVendor', () => {
  it('maps id', () => {
    expect(transformVendor(makeVendor()).id).toBe('vendor_001')
  })

  it('maps company_name to name and companyName', () => {
    const result = transformVendor(makeVendor())
    expect(result.name).toBe('Acme Corp')
    expect(result.companyName).toBe('Acme Corp')
  })

  it('always sets isCustomer to false', () => {
    expect(transformVendor(makeVendor()).isCustomer).toBe(false)
  })

  it('always sets isSupplier to true', () => {
    expect(transformVendor(makeVendor()).isSupplier).toBe(true)
  })

  it('always sets isActive to true', () => {
    expect(transformVendor(makeVendor()).isActive).toBe(true)
  })

  it('maps email to emails array with WORK type', () => {
    const result = transformVendor(makeVendor())
    expect(result.emails).toHaveLength(1)
    expect(result.emails?.[0]).toEqual({ email: 'billing@acme.com', type: 'WORK' })
  })

  it('emails is undefined when email is absent', () => {
    const result = transformVendor(makeVendor({ email: undefined }))
    expect(result.emails).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeVendor()
    expect(transformVendor(raw).metadata).toBe(raw)
  })

  it('metadata contains payment_accounts', () => {
    const raw = makeVendor()
    const result = transformVendor(raw)
    const meta = result.metadata as Record<string, unknown>
    expect(Array.isArray(meta['payment_accounts'])).toBe(true)
  })

  it('produces output that passes ContactSchema validation', () => {
    const result = transformVendor(makeVendor())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformVendor(
      makeVendor({
        company_name: undefined,
        email: undefined,
        phone: undefined,
        payment_accounts: undefined,
      }),
    )
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('untransformVendor', () => {
  it('maps companyName to company_name', () => {
    const contact: Partial<Contact> = { companyName: 'Acme Corp' }
    expect(untransformVendor(contact).company_name).toBe('Acme Corp')
  })

  it('falls back to name when companyName is absent', () => {
    const contact: Partial<Contact> = { name: 'Acme Corp' }
    expect(untransformVendor(contact).company_name).toBe('Acme Corp')
  })

  it('prefers companyName over name', () => {
    const contact: Partial<Contact> = { companyName: 'Company Name', name: 'Contact Name' }
    expect(untransformVendor(contact).company_name).toBe('Company Name')
  })

  it('maps first email to email field', () => {
    const contact: Partial<Contact> = {
      emails: [{ email: 'billing@acme.com', type: 'WORK' }],
    }
    expect(untransformVendor(contact).email).toBe('billing@acme.com')
  })

  it('email is undefined when emails array is absent', () => {
    const contact: Partial<Contact> = {}
    expect(untransformVendor(contact).email).toBeUndefined()
  })

  it('maps first telephone to phone field', () => {
    const contact: Partial<Contact> = {
      telephones: [{ telephone: '+14155551234', type: 'WORK' }],
    }
    expect(untransformVendor(contact).phone).toBe('+14155551234')
  })

  it('phone is undefined when telephones array is absent', () => {
    const contact: Partial<Contact> = {}
    expect(untransformVendor(contact).phone).toBeUndefined()
  })

  it('round-trips a full vendor through transform → untransform', () => {
    const raw = makeVendor()
    const transformed = transformVendor(raw)
    const untransformed = untransformVendor(transformed)
    expect(untransformed.company_name).toBe('Acme Corp')
    expect(untransformed.email).toBe('billing@acme.com')
  })
})
