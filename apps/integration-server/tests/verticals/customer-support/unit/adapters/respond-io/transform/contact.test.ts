/**
 * respond-io transformContact, against the documented Contact schema
 * (https://developers.respond.io/docs/api/cab9510b2994a-contact and
 * ContactFields, https://developers.respond.io/docs/api/cf79be21b1ccc-contact-fields).
 * The fixture is assembled from the schema's own `example` values.
 */
import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'
import { transformContact } from '../../../../../../../src/verticals/customer-support/adapters/respond-io/transform/contact'
import { DOC_CONTACT } from '../fixtures'

describe('respond-io transformContact', () => {
  it('maps the documented example Contact onto the canonical schema', () => {
    const out = ContactSchema.parse(transformContact(DOC_CONTACT))
    expect(out).toMatchObject({
      id: '12345',
      externalId: '12345',
      name: 'Muhammad Mahin',
      email: 'test@example.com',
      phone: '+60123456789',
      platform: 'respond-io',
      metadata: {
        language: 'ms',
        profilePic: 'https://cdn.respond.io/profile_avatar.png',
        countryCode: 'MY',
        status: 'open',
        lifecycle: 'Hot Lead',
      },
    })
    expect(out.raw).toBe(DOC_CONTACT)
  })

  it('leaves nullable fields absent rather than inventing values', () => {
    const out = ContactSchema.parse(
      transformContact({ id: 7, firstName: 'Ana', lastName: null, phone: null, email: null }),
    )
    expect(out.name).toBe('Ana')
    expect(out.email).toBeUndefined()
    expect(out.phone).toBeUndefined()
    expect(out.metadata).toEqual({})
  })

  it('keeps a malformed email out of the canonical field (the doc types it as a plain string)', () => {
    const raw = { id: 8, firstName: 'Bo', email: 'not-an-email' }
    const out = ContactSchema.parse(transformContact(raw))
    expect(out.email).toBeUndefined()
    expect(out.raw).toBe(raw)
  })

  it('does not stand the id in for a missing name', () => {
    const out = ContactSchema.parse(transformContact({ id: 99 }))
    expect(out.name).toBe('')
  })
})
