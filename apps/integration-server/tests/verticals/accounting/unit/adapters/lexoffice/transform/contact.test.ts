import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type LexofficeContact,
} from '../../../../../../../src/verticals/accounting/adapters/lexoffice/transform/contact'

function makeContact(overrides: Partial<LexofficeContact> = {}): LexofficeContact {
  return {
    id: 'contact-uuid-001',
    version: 1,
    roles: {
      customer: { number: 10001 },
    },
    company: {
      name: 'Acme GmbH',
      taxNumber: '12345/67890',
      vatRegistrationId: 'DE123456789',
      contactPersons: [],
    },
    addresses: {
      billing: [{ street: 'Hauptstr. 1', zip: '10115', city: 'Berlin', countryCode: 'DE' }],
      shipping: [{ street: 'Nebenstr. 2', zip: '20095', city: 'Hamburg', countryCode: 'DE' }],
    },
    emailAddresses: { business: ['info@acme.de'] },
    phoneNumbers: { business: ['+49-30-12345'], mobile: ['+49-170-98765'] },
    archived: false,
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id correctly', () => {
    expect(transformContact(makeContact()).id).toBe('contact-uuid-001')
  })

  it('maps company name to name and companyName', () => {
    const result = transformContact(makeContact())
    expect(result.name).toBe('Acme GmbH')
    expect(result.companyName).toBe('Acme GmbH')
  })

  it('maps vatRegistrationId to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('DE123456789')
  })

  it('maps customer role number to identification', () => {
    expect(transformContact(makeContact()).identification).toBe('10001')
  })

  it('maps customer role to isCustomer true', () => {
    expect(transformContact(makeContact()).isCustomer).toBe(true)
  })

  it('maps vendor role to isSupplier true', () => {
    const result = transformContact(makeContact({ roles: { vendor: { number: 20001 } } }))
    expect(result.isSupplier).toBe(true)
  })

  it('sets isSupplier false when no vendor role', () => {
    expect(transformContact(makeContact()).isSupplier).toBe(false)
  })

  it('maps archived false to isActive true', () => {
    expect(transformContact(makeContact({ archived: false })).isActive).toBe(true)
  })

  it('maps archived true to isActive false', () => {
    expect(transformContact(makeContact({ archived: true })).isActive).toBe(false)
  })

  it('maps business email to emails array with type WORK', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@acme.de')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps business phone to telephones with type WORK', () => {
    const result = transformContact(makeContact())
    const workPhone = result.telephones?.find((t) => t.type === 'WORK')
    expect(workPhone?.telephone).toBe('+49-30-12345')
  })

  it('maps mobile phone to telephones with type MOBILE', () => {
    const result = transformContact(makeContact())
    const mobilePhone = result.telephones?.find((t) => t.type === 'MOBILE')
    expect(mobilePhone?.telephone).toBe('+49-170-98765')
  })

  it('maps billing address correctly', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('Hauptstr. 1')
    expect(result.billingAddress?.city).toBe('Berlin')
    expect(result.billingAddress?.postalCode).toBe('10115')
    expect(result.billingAddress?.country).toBe('DE')
  })

  it('maps shipping address correctly', () => {
    const result = transformContact(makeContact())
    expect(result.shippingAddress?.address1).toBe('Nebenstr. 2')
    expect(result.shippingAddress?.city).toBe('Hamburg')
    expect(result.shippingAddress?.postalCode).toBe('20095')
    expect(result.shippingAddress?.country).toBe('DE')
  })

  it('maps person firstName and lastName', () => {
    const result = transformContact(
      makeContact({
        company: undefined,
        person: { salutation: 'Mr', firstName: 'Hans', lastName: 'Müller' },
      }),
    )
    expect(result.firstName).toBe('Hans')
    expect(result.lastName).toBe('Müller')
    expect(result.name).toBe('Hans Müller')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
