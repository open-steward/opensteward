/** Saasu Contact → Contact, over the documented GET Contacts sample. */
import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact } from '../../../../../../../src/verticals/accounting/adapters/saasu/transform/contact'
import { contact } from '../fixtures'

describe('transformContact (saasu)', () => {
  it('maps the documented fields', () => {
    const c = ContactSchema.parse(transformContact(contact()))
    expect(c).toMatchObject({
      id: '896421',
      name: 'Mary Biggs',
      firstName: 'Mary',
      lastName: 'Biggs',
      identification: '4567',
      isCustomer: true,
      isSupplier: false,
      isActive: true,
      emails: [{ email: 'mary@example.com', type: 'WORK' }],
      telephones: [
        { telephone: '02 5555 4444', type: 'WORK' },
        { telephone: '04 1111 1111', type: 'MOBILE' },
        { telephone: '02 5555 4445', type: 'FAX' },
      ],
      billingAddress: {
        address1: '456 Arndale Street',
        city: 'Sydney',
        region: 'NSW',
        postalCode: '2000',
        country: 'AU',
      },
      shippingAddress: { address1: '123 whatever Street', city: 'Melbourne', country: 'AU' },
    })
    expect(c.createdAt).toEqual(new Date('2026-09-27T19:00:11.347Z'))
  })

  it('leaves out a country it cannot normalise', () => {
    const c = ContactSchema.parse(
      transformContact(
        contact({ PostalAddress: { City: 'Sydney', Country: 'Oz' }, OtherAddress: null }),
      ),
    )
    expect(c.billingAddress).toEqual({ city: 'Sydney' })
    expect(c.shippingAddress).toBeUndefined()
  })

  it('reports no emails or phones when none are set', () => {
    const c = ContactSchema.parse(
      transformContact(
        contact({ EmailAddress: null, PrimaryPhone: null, MobilePhone: null, Fax: null }),
      ),
    )
    expect(c.emails).toBeUndefined()
    expect(c.telephones).toBeUndefined()
  })
})
