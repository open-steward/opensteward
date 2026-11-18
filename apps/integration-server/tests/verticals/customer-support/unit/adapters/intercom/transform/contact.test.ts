import { describe, it, expect } from 'vitest'
import { transformContact } from '../../../../../../../src/verticals/customer-support/adapters/intercom/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'

describe('transformContact (Intercom contact)', () => {
  it('maps a user contact and parses', () => {
    const c = ContactSchema.parse(
      transformContact({
        type: 'contact',
        id: '6762f14a1bb69f9f2193bbb3',
        external_id: '70',
        role: 'user',
        email: 'joe@bloggs.com',
        phone: '+353871234567',
        name: 'Joe Bloggs',
      }),
    )
    expect(c).toMatchObject({
      id: '6762f14a1bb69f9f2193bbb3',
      externalId: '6762f14a1bb69f9f2193bbb3',
      email: 'joe@bloggs.com',
      phone: '+353871234567',
      name: 'Joe Bloggs',
      platform: 'intercom',
    })
    expect(c.metadata).toEqual({ role: 'user', externalId: '70' })
  })

  it('a lead with no name falls back to the email; an invalid email is dropped, not a parse failure', () => {
    expect(
      ContactSchema.parse(
        transformContact({ id: 'l1', role: 'lead', email: 'lead@x.io', name: null }),
      ).name,
    ).toBe('lead@x.io')
    const bad = ContactSchema.parse(
      transformContact({ id: 'l2', role: 'lead', email: 'not-an-email', name: null, phone: null }),
    )
    expect(bad.email).toBeUndefined()
    expect(bad.phone).toBeUndefined()
    expect(bad.name).toBe('not-an-email')
  })
})
