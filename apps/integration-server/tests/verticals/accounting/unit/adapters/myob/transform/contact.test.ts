import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type MyobContact } from '../../../../../../../src/verticals/accounting/adapters/myob/transform/contact'

function makeContact(overrides: Partial<MyobContact> = {}): MyobContact {
  return {
    UID: 'uid-2', CompanyName: 'Customer Pty', IsActive: true,
    Addresses: [{ Street: '10 Main St', City: 'Sydney', State: 'NSW', PostCode: '2000', Country: 'AU', Email: 'info@co.au', Phone1: '+61299999' }],
    ...overrides,
  }
}

describe('transformContact (myob)', () => {
  it('maps id and companyName', () => {
    expect(transformContact(makeContact()).id).toBe('uid-2')
    expect(transformContact(makeContact()).companyName).toBe('Customer Pty')
  })
  it('maps email from address', () => { expect(transformContact(makeContact()).emails?.[0]?.email).toBe('info@co.au') })
  it('maps phone from address', () => { expect(transformContact(makeContact()).telephones?.[0]?.telephone).toBe('+61299999') })
  it('maps billing address', () => {
    expect(transformContact(makeContact()).billingAddress?.city).toBe('Sydney')
  })
  it('isCustomer true', () => { expect(transformContact(makeContact()).isCustomer).toBe(true) })
  it('passes raw as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
