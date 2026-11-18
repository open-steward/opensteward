import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type NetSuiteCustomer } from '../../../../../../../src/verticals/accounting/adapters/netsuite/transform/contact'

function makeCustomer(overrides: Partial<NetSuiteCustomer> = {}): NetSuiteCustomer {
  return { id: 100, companyName: 'Customer LLC', email: 'info@co.com', phone: '+15551234', isInactive: false, currency: 'USD', ...overrides }
}

describe('transformContact (netsuite)', () => {
  it('maps id and companyName', () => {
    expect(transformContact(makeCustomer()).id).toBe('100')
    expect(transformContact(makeCustomer()).companyName).toBe('Customer LLC')
  })
  it('isInactive false → isActive true', () => { expect(transformContact(makeCustomer()).isActive).toBe(true) })
  it('isInactive true → isActive false', () => { expect(transformContact(makeCustomer({ isInactive: true })).isActive).toBe(false) })
  it('maps email', () => { expect(transformContact(makeCustomer()).emails?.[0]?.email).toBe('info@co.com') })
  it('passes raw as metadata', () => {
    const raw = makeCustomer()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeCustomer())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
