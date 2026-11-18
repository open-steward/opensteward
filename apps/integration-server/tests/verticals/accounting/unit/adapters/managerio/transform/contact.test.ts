import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type ManagerioContact } from '../../../../../../../src/verticals/accounting/adapters/managerio/transform/contact'

function makeRaw(overrides: Partial<ManagerioContact> = {}): ManagerioContact {
  return {
    Key: 'cust-001',
    Name: 'Acme Corp',
    Email: 'info@acme.ae',
    Phone: '+971501234567',
    BillingAddress: { Line1: '123 Sheikh Zayed Rd', City: 'Dubai', PostalCode: '00000', Country: 'AE' },
    CustomFields: {},
    TaxCode: 'TRN123',
    ...overrides,
  }
}

describe('transformContact (managerio)', () => {
  it('maps core fields', () => {
    const r = transformContact(makeRaw(), true)
    expect(r.id).toBe('cust-001')
    expect(r.name).toBe('Acme Corp')
  })

  it('maps email to emails array', () => {
    const r = transformContact(makeRaw(), true)
    expect(r.emails![0].email).toBe('info@acme.ae')
  })

  it('maps billing address', () => {
    const r = transformContact(makeRaw(), true)
    expect(r.billingAddress?.address1).toBe('123 Sheikh Zayed Rd')
    expect(r.billingAddress?.city).toBe('Dubai')
  })

  it('sets isCustomer=true when second arg is true', () => {
    expect(transformContact(makeRaw(), true).isCustomer).toBe(true)
  })

  it('sets isSupplier=true when second arg is false', () => {
    expect(transformContact(makeRaw(), false).isSupplier).toBe(true)
  })

  it('passes metadata unchanged', () => {
    const raw = makeRaw()
    expect(transformContact(raw, true).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw(), true)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
