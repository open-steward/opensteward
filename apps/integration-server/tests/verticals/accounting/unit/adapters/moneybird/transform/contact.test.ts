import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type MoneybirdContact } from '../../../../../../../src/verticals/accounting/adapters/moneybird/transform/contact'

function makeContact(overrides: Partial<MoneybirdContact> = {}): MoneybirdContact {
  return { id: 200, company_name: 'Klant BV', email: 'info@klant.nl', phone: '+31612345678', city: 'Utrecht', country: 'NL', ...overrides }
}

describe('transformContact (moneybird)', () => {
  it('maps id and company_name', () => {
    const r = transformContact(makeContact())
    expect(r.id).toBe('200')
    expect(r.companyName).toBe('Klant BV')
  })
  it('maps email and phone', () => {
    const r = transformContact(makeContact())
    expect(r.emails?.[0]?.email).toBe('info@klant.nl')
    expect(r.telephones?.[0]?.telephone).toBe('+31612345678')
  })
  it('maps billing address', () => {
    const r = transformContact(makeContact({ address1: 'Hoofdstraat 1', city: 'Utrecht' }))
    expect(r.billingAddress?.city).toBe('Utrecht')
  })
  it('sets isCustomer true', () => { expect(transformContact(makeContact()).isCustomer).toBe(true) })
  it('passes raw as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
