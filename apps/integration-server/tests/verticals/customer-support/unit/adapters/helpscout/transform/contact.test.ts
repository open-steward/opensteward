/**
 * Fixture: the documented example of
 * https://developer.helpscout.com/mailbox-api/endpoints/customers/get/
 * (fetched 2026-09-28; _links trimmed).
 */
import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type RawHelpScoutCustomer,
} from '../../../../../../../src/verticals/customer-support/adapters/helpscout/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'

const documented: RawHelpScoutCustomer = {
  id: 500,
  firstName: 'Vernon',
  lastName: 'Bear',
  gender: 'Male',
  jobTitle: 'CEO and Co-Founder',
  location: 'Greater Dallas/FT Worth Area',
  organization: 'Acme, Inc',
  organizationId: 35,
  photoType: 'twitter',
  age: '30-35',
  conversationCount: 10,
  createdAt: '2012-07-23T12:34:12Z',
  updatedAt: '2012-07-24T20:18:33Z',
  background: "I've worked with Vernon before and he's really great.",
  draft: false,
  _embedded: {
    emails: [{ id: 1, value: 'bear@acme.com', type: 'home' }],
    phones: [{ id: 2, value: '123-123-123', type: 'home' }],
    chats: [{ id: 5, value: '54831172', type: 'aim' }],
    social_profiles: [{ id: 4, value: '@me', type: 'twitter' }],
    websites: [{ id: 3, value: 'http://home.com' }],
    properties: [],
    address: { city: 'Prague', lines: [] },
  },
}

describe('helpscout transformContact', () => {
  it('parses the documented customer against ContactSchema', () => {
    const out = ContactSchema.parse(transformContact(documented))
    expect(out).toMatchObject({
      id: '500',
      externalId: '500',
      email: 'bear@acme.com',
      name: 'Vernon Bear',
      phone: '123-123-123',
      organizationId: '35',
      platform: 'helpscout',
    })
    expect(out.metadata).toMatchObject({ updatedAt: '2012-07-24T20:18:33Z', draft: 'false' })
  })

  it('parses the list shape, whose embedded arrays are empty', () => {
    const out = ContactSchema.parse(
      transformContact({ ...documented, _embedded: { emails: [], phones: [] } }),
    )
    expect(out.email).toBeUndefined()
    expect(out.phone).toBeUndefined()
  })

  it('skips an embedded email that is not an address', () => {
    const out = ContactSchema.parse(
      transformContact({
        ...documented,
        _embedded: { emails: [{ value: 'not-an-email' }, { value: 'b@acme.com' }] },
      }),
    )
    expect(out.email).toBe('b@acme.com')
  })
})
