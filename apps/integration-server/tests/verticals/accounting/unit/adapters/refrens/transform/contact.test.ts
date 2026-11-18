import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type RefrensContactEmbedded,
} from '../../../../../../../src/verticals/accounting/adapters/refrens/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeRaw(overrides: Partial<RefrensContactEmbedded> = {}): RefrensContactEmbedded {
  return {
    name: 'Acme Industries',
    email: 'billing@acme.in',
    phone: '+91-9876543210',
    gstin: '22AAAAA0000A1Z5',
    panNumber: 'AAAAA0000A',
    street: '12 MG Road',
    city: 'Bengaluru',
    pincode: '560001',
    gstState: 'Karnataka',
    country: 'IN',
    ...overrides,
  }
}

describe('transformContact — isCustomer=true', () => {
  it('uses the provided id', () => {
    const result = transformContact(makeRaw(), 'cust_001', true)
    expect(result.id).toBe('cust_001')
  })

  it('sets isCustomer=true and isSupplier=false', () => {
    const result = transformContact(makeRaw(), 'cust_001', true)
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps name', () => {
    const result = transformContact(makeRaw({ name: 'Globex Corp' }), 'c1', true)
    expect(result.name).toBe('Globex Corp')
  })

  it('maps gstin to taxNumber', () => {
    const result = transformContact(makeRaw({ gstin: '29AAFCS1429B1Z3' }), 'c1', true)
    expect(result.taxNumber).toBe('29AAFCS1429B1Z3')
  })

  it('falls back to panNumber when gstin is absent', () => {
    const result = transformContact(
      makeRaw({ gstin: undefined, panNumber: 'BBBBB1111B' }),
      'c1',
      true,
    )
    expect(result.taxNumber).toBe('BBBBB1111B')
  })

  it('maps email to emails array as WORK type', () => {
    const result = transformContact(makeRaw({ email: 'accounts@example.in' }), 'c1', true)
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0]).toEqual({ email: 'accounts@example.in', type: 'WORK' })
  })

  it('returns undefined emails when email is absent', () => {
    const result = transformContact(makeRaw({ email: undefined }), 'c1', true)
    expect(result.emails).toBeUndefined()
  })

  it('maps phone to telephones array as WORK type', () => {
    const result = transformContact(makeRaw({ phone: '+91-9876543210' }), 'c1', true)
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0]).toEqual({ telephone: '+91-9876543210', type: 'WORK' })
  })

  it('returns undefined telephones when phone is absent', () => {
    const result = transformContact(makeRaw({ phone: undefined }), 'c1', true)
    expect(result.telephones).toBeUndefined()
  })

  it('maps billing address fields', () => {
    const result = transformContact(makeRaw(), 'c1', true)
    expect(result.billingAddress?.address1).toBe('12 MG Road')
    expect(result.billingAddress?.city).toBe('Bengaluru')
    expect(result.billingAddress?.postalCode).toBe('560001')
    expect(result.billingAddress?.region).toBe('Karnataka')
    expect(result.billingAddress?.country).toBe('IN')
  })

  it('passes raw object through as metadata (reference equality)', () => {
    const raw = makeRaw()
    const result = transformContact(raw, 'c1', true)
    expect(result.metadata).toBe(raw)
  })

  it('produces output that satisfies ContactSchema', () => {
    const result = transformContact(makeRaw(), 'cust_001', true)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('transformContact — isCustomer=false (supplier)', () => {
  it('sets isCustomer=false and isSupplier=true', () => {
    const result = transformContact(makeRaw(), 'supp_001', false)
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps core fields the same way as customer', () => {
    const result = transformContact(makeRaw(), 'supp_001', false)
    expect(result.id).toBe('supp_001')
    expect(result.name).toBe('Acme Industries')
    expect(result.taxNumber).toBe('22AAAAA0000A1Z5')
  })

  it('produces output that satisfies ContactSchema', () => {
    const result = transformContact(makeRaw(), 'supp_001', false)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
