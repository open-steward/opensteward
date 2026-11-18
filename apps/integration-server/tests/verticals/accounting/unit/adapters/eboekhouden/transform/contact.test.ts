import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type EBoekhoudenContact } from '../../../../../../../src/verticals/accounting/adapters/eboekhouden/transform/contact'

function makeContact(overrides: Partial<EBoekhoudenContact> = {}): EBoekhoudenContact {
  return {
    id: 42,
    companyName: 'Klant BV',
    email: 'info@klant.nl',
    phone: '+31201234567',
    isDebtor: true,
    isCreditor: false,
    isActive: true,
    city: 'Rotterdam',
    country: 'NL',
    ...overrides,
  }
}

describe('transformContact (eboekhouden)', () => {
  it('maps id to string', () => {
    expect(transformContact(makeContact()).id).toBe('42')
  })

  it('maps companyName', () => {
    expect(transformContact(makeContact()).companyName).toBe('Klant BV')
  })

  it('maps email to emails array', () => {
    expect(transformContact(makeContact()).emails?.[0]?.email).toBe('info@klant.nl')
  })

  it('maps phone to telephones', () => {
    expect(transformContact(makeContact()).telephones?.[0]?.telephone).toBe('+31201234567')
  })

  it('maps isDebtor to isCustomer', () => {
    expect(transformContact(makeContact({ isDebtor: true })).isCustomer).toBe(true)
  })

  it('maps isCreditor to isSupplier', () => {
    expect(transformContact(makeContact({ isCreditor: true })).isSupplier).toBe(true)
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact({ address: 'Stadhuisplein 1', city: 'Rotterdam', country: 'NL' }))
    expect(result.billingAddress?.city).toBe('Rotterdam')
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
