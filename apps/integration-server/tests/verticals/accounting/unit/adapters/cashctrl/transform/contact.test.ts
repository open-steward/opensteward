import { describe, it, expect } from 'vitest'
import {
  transformPerson,
  type CashCtrlPerson,
} from '../../../../../../../src/verticals/accounting/adapters/cashctrl/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makePerson(overrides: Partial<CashCtrlPerson> = {}): CashCtrlPerson {
  return {
    id: 10,
    firstName: 'Jane',
    lastName: 'Doe',
    ...overrides,
  }
}

describe('transformPerson', () => {
  it('maps id to string', () => {
    expect(transformPerson(makePerson({ id: 77 })).id).toBe('77')
  })

  it('maps firstName', () => {
    expect(transformPerson(makePerson()).firstName).toBe('Jane')
  })

  it('maps lastName', () => {
    expect(transformPerson(makePerson()).lastName).toBe('Doe')
  })

  it('maps company to companyName', () => {
    expect(transformPerson(makePerson({ company: 'Acme Inc.' })).companyName).toBe('Acme Inc.')
  })

  it('maps vatUid to taxNumber', () => {
    expect(transformPerson(makePerson({ vatUid: 'CHE-123.456.789' })).taxNumber).toBe(
      'CHE-123.456.789',
    )
  })

  it('maps currencyCode to currency', () => {
    expect(transformPerson(makePerson({ currencyCode: 'EUR' })).currency).toBe('EUR')
  })

  it('always sets isCustomer to true', () => {
    expect(transformPerson(makePerson()).isCustomer).toBe(true)
  })

  it('always sets isSupplier to true', () => {
    expect(transformPerson(makePerson()).isSupplier).toBe(true)
  })

  it('maps isInactive=false to isActive=true', () => {
    expect(transformPerson(makePerson({ isInactive: false })).isActive).toBe(true)
  })

  it('maps isInactive=true to isActive=false', () => {
    expect(transformPerson(makePerson({ isInactive: true })).isActive).toBe(false)
  })

  it('maps first email (before comma) to emails array', () => {
    const result = transformPerson(makePerson({ email: 'jane@acme.com,other@acme.com' }))
    expect(result.emails).toBeDefined()
    expect(result.emails![0]!.email).toBe('jane@acme.com')
  })

  it('maps phone to telephones with type WORK', () => {
    const result = transformPerson(makePerson({ phone: '+41441234567' }))
    expect(result.telephones).toBeDefined()
    expect(result.telephones![0]!.telephone).toBe('+41441234567')
    expect(result.telephones![0]!.type).toBe('WORK')
  })

  it('maps mobile to telephones with type MOBILE', () => {
    const result = transformPerson(makePerson({ mobile: '+41791234567' }))
    expect(result.telephones).toBeDefined()
    const mobile = result.telephones!.find((t) => t.type === 'MOBILE')
    expect(mobile?.telephone).toBe('+41791234567')
  })

  it('maps billing address from addresses array', () => {
    const result = transformPerson(
      makePerson({
        addresses: [
          { type: 'MAIN', address: '123 Main St', zip: '8001', city: 'Zurich', country: 'CH' },
        ],
      }),
    )
    expect(result.billingAddress).toBeDefined()
    expect(result.billingAddress!.city).toBe('Zurich')
  })

  it('leaves billingAddress undefined when addresses is empty', () => {
    expect(transformPerson(makePerson({ addresses: [] })).billingAddress).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makePerson()
    expect(transformPerson(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => ContactSchema.parse(transformPerson(makePerson()))).not.toThrow()
  })
})
