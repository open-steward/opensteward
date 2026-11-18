import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type BokioCustomer,
} from '../../../../../../../src/verticals/accounting/adapters/bokio/transform/contact'
import { CUSTOMER, copyOf } from '../fixtures'

const customer = (overrides: Partial<BokioCustomer> = {}): BokioCustomer => ({
  ...copyOf<BokioCustomer>(CUSTOMER),
  ...overrides,
})

describe('transformContact (Bokio, documented customer)', () => {
  it('maps the documented example and parses against ContactSchema', () => {
    const out = ContactSchema.parse(transformContact(customer()))
    expect(out).toMatchObject({
      id: '55c899c5-82b2-47fa-9c51-e35fc9b26443',
      name: 'customer 1',
      companyName: 'customer 1',
      identification: '123456-7890',
      taxNumber: 'SE1234567890',
      isCustomer: true,
      isSupplier: false,
      emails: [{ email: 'john@email.com' }],
      telephones: [{ telephone: '0927-5631505' }],
      billingAddress: {
        address1: 'Älvsborgsvägen 10',
        city: 'Göteborg',
        postalCode: '123 45',
        country: 'SE',
      },
    })
    expect(out.updatedAt).toEqual(new Date('2024-10-10T00:00:00Z'))
    // contactsDetails documents no kind of email or phone, so none is invented.
    expect(out.emails?.[0]?.type).toBeUndefined()
    expect(out.telephones?.[0]?.type).toBeUndefined()
  })

  it('does not set companyName for a private customer', () => {
    const out = ContactSchema.parse(transformContact(customer({ type: 'private' })))
    expect(out.companyName).toBeUndefined()
    expect(out.name).toBe('customer 1')
  })

  it('puts the default contact detail first', () => {
    const out = ContactSchema.parse(
      transformContact(
        customer({
          contactsDetails: [
            { name: 'B', email: 'b@example.com', isDefault: false },
            { name: 'A', email: 'a@example.com', isDefault: true },
          ],
        }),
      ),
    )
    expect(out.emails?.map((e) => e.email)).toEqual(['a@example.com', 'b@example.com'])
  })

  it('reads address.line1/country, not undocumented street/countryCode', () => {
    const out = ContactSchema.parse(
      transformContact(
        customer({
          address: { line1: 'Gatan 1', city: 'Lund', postalCode: '222 22', country: 'SE' },
          street: 'wrong',
        }),
      ),
    )
    expect(out.billingAddress).toMatchObject({ address1: 'Gatan 1', country: 'SE' })
  })

  it('leaves updatedAt unset when modifiedDateTime is null', () => {
    const out = ContactSchema.parse(transformContact(customer({ modifiedDateTime: null })))
    expect(out.updatedAt).toBeUndefined()
  })

  it('keeps the raw row as metadata', () => {
    const raw = customer()
    expect(transformContact(raw).metadata).toBe(raw)
  })
})
