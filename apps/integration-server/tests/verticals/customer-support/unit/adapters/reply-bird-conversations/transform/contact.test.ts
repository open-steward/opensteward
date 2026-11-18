/**
 * Bird contact → canonical Contact.
 *
 * Fixture: the documented `200` example of `GET /v1/contacts/{contact_id}`
 * (https://bird.com/docs/api/reference/get-contact):
 *   { "id": "con_01krdgeqcxet5s7t44vh8rt9mg",
 *     "audiences": [{ "id": "adn_01krdgeqcxet5s7t44vh8rt9mg" }],
 *     "created_at": "2026-05-20T09:14:52Z", "updated_at": "2026-05-25T16:42:01Z" }
 * plus the fields the response body lists as required (`email`,
 * `phone_number`) or optional (`first_name`, `last_name`, `external_id`),
 * with values taken from the spec's own parameter examples where it gives one.
 */
import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'
import {
  transformContact,
  type RawBirdContact,
} from '../../../../../../../src/verticals/customer-support/adapters/reply-bird-conversations/transform/contact'

const DOC_EXAMPLE: RawBirdContact = {
  id: 'con_01krdgeqcxet5s7t44vh8rt9mg',
  email: 'user@example.com',
  phone_number: '+31612345678',
  first_name: 'Jane',
  last_name: 'Doe',
  external_id: 'user_12345',
  audiences: [{ id: 'adn_01krdgeqcxet5s7t44vh8rt9mg' }],
  created_at: '2026-05-20T09:14:52Z',
  updated_at: '2026-05-25T16:42:01Z',
}

describe('Bird transformContact', () => {
  it('maps the documented contact onto a valid canonical Contact', () => {
    const c = ContactSchema.parse(transformContact(DOC_EXAMPLE))
    expect(c).toMatchObject({
      id: 'con_01krdgeqcxet5s7t44vh8rt9mg',
      externalId: 'con_01krdgeqcxet5s7t44vh8rt9mg',
      email: 'user@example.com',
      phone: '+31612345678',
      name: 'Jane Doe',
      platform: 'reply-bird-conversations',
      metadata: {
        createdAt: '2026-05-20T09:14:52Z',
        updatedAt: '2026-05-25T16:42:01Z',
        birdExternalId: 'user_12345',
      },
    })
    expect(c.raw).toBe(DOC_EXAMPLE)
  })

  it('leaves email and phone absent when Bird sends null ("`null` when the contact has no email address")', () => {
    const c = ContactSchema.parse(
      transformContact({
        ...DOC_EXAMPLE,
        email: null,
        phone_number: null,
        first_name: null,
        last_name: 'Doe',
        external_id: null,
      }),
    )
    expect(c).not.toHaveProperty('email')
    expect(c).not.toHaveProperty('phone')
    expect(c.name).toBe('Doe')
    expect(c.metadata).not.toHaveProperty('birdExternalId')
  })

  it('parses the bare documented example, where no name fields are present', () => {
    const bare = {
      id: 'con_01krdgeqcxet5s7t44vh8rt9mg',
      email: null,
      phone_number: null,
      audiences: [{ id: 'adn_01krdgeqcxet5s7t44vh8rt9mg' }],
      created_at: '2026-05-20T09:14:52Z',
      updated_at: '2026-05-25T16:42:01Z',
    }
    const c = ContactSchema.parse(transformContact(bare))
    expect(c.id).toBe('con_01krdgeqcxet5s7t44vh8rt9mg')
    expect(c.name).toBe('')
  })
})
