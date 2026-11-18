import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type XeroContact } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/contact'

/**
 * Finding 23 — `{}` asserts a known-empty address; absence is the truth.
 *
 * Xero returns address entries carrying only a type discriminator:
 *
 *     "Addresses": [ { "AddressType": "POBOX" }, { "AddressType": "STREET" } ]
 *
 * The transform built an object whenever an entry existed, so every field came
 * out undefined and the record serialised as `billingAddress: {}`. A consumer
 * counting contacts with missing addresses cannot tell "we know there is no
 * address" from "the source told us nothing" — the same defect as Finding 2,
 * in object form rather than array form.
 *
 * The shared `toAddress` helper has always returned `undefined` when every
 * field is falsy. This transform hand-rolled its own instead of using it,
 * which is the whole bug.
 */

function contact(overrides: Partial<XeroContact> = {}): XeroContact {
  return {
    ContactID: 'c-1',
    Name: 'Luna Cafe',
    FirstName: '',
    LastName: '',
    IsCustomer: true,
    IsSupplier: false,
    ContactStatus: 'ACTIVE',
    EmailAddress: '',
    TaxNumber: '',
    DefaultCurrency: 'USD',
    Phones: [],
    Addresses: [],
    ...overrides,
  } as XeroContact
}

describe('Xero contact addresses distinguish empty from absent', () => {
  it('omits an address whose entry carries only a type discriminator', () => {
    // Verbatim from the live demo org.
    const r = transformContact(contact({
      Addresses: [{ AddressType: 'POBOX' }, { AddressType: 'STREET' }] as never,
    }))
    expect(r.billingAddress).toBeUndefined()
    expect(r.shippingAddress).toBeUndefined()
  })

  it('does not emit an empty object once serialised', () => {
    const r = transformContact(contact({
      Addresses: [{ AddressType: 'STREET' }] as never,
    }))
    const json = JSON.parse(JSON.stringify(r))
    expect(json.billingAddress).toBeUndefined()
    expect(JSON.stringify(json)).not.toContain('"billingAddress":{}')
  })

  it('omits addresses whose fields are present but all empty strings', () => {
    const r = transformContact(contact({
      Addresses: [
        { AddressType: 'STREET', AddressLine1: '', AddressLine2: '', City: '', PostalCode: '', Country: '' },
      ] as never,
    }))
    expect(r.shippingAddress).toBeUndefined()
  })

  it('still emits an address when any field carries data', () => {
    const r = transformContact(contact({
      Addresses: [{ AddressType: 'STREET', City: 'Wellington' }] as never,
    }))
    expect(r.shippingAddress).toEqual({ city: 'Wellington' })
  })

  it('keeps a fully populated address intact', () => {
    const r = transformContact(contact({
      Addresses: [{
        AddressType: 'POBOX', AddressLine1: 'PO Box 42', AddressLine2: 'Level 2',
        City: 'Wellington', PostalCode: '6011', Country: 'NZ',
      }] as never,
    }))
    expect(r.billingAddress).toMatchObject({
      address1: 'PO Box 42', address2: 'Level 2', city: 'Wellington',
      postalCode: '6011', country: 'NZ',
    })
  })

  it('omits both when the platform sends no addresses at all', () => {
    const r = transformContact(contact({ Addresses: [] }))
    expect(r.billingAddress).toBeUndefined()
    expect(r.shippingAddress).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    expect(() =>
      ContactSchema.parse(transformContact(contact({ Addresses: [{ AddressType: 'STREET' }] as never }))),
    ).not.toThrow()
  })
})
