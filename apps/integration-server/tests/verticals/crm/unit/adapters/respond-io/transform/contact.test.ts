/**
 * The fixture is built from the documented Contact model
 * (https://developers.respond.io/docs/api/cab9510b2994a-contact, Stoplight node
 * JSON https://stoplight.io/api/v1/projects/cHJqOjIyMDQ1OA/nodes/cab9510b2994a-contact):
 * `id` ("Contact ID", example 12345), `firstName` ("Muhammad "), `lastName`
 * ("Mahin"), `phone` ("+60123456789"), `email` ("test@example.com"),
 * `language` ("ms"), `profilePic`, `countryCode` ("MY"), `custom_fields`,
 * `status` (enum open|closed|blocked), `tags`, `assignee` (User: id,
 * firstName, lastName, email), `lifecycle` ("Hot Lead"), `created_at` ("Unix
 * timestamp in seconds representing when the contact was created.", example
 * 1663274081) and `isBlocked`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawRespondIoContact,
} from '../../../../../../../src/verticals/crm/adapters/respond-io/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

const DOCUMENTED: RawRespondIoContact = {
  id: 12345,
  // Verbatim from the documented example, trailing space included.
  firstName: 'Muhammad ',
  lastName: 'Mahin',
  phone: '+60123456789',
  email: 'test@example.com',
  language: 'ms',
  profilePic: 'https://cdn.respond.io/profile_avatar.png',
  countryCode: 'MY',
  custom_fields: [{ name: 'Company Website', value: 'https://example.com' }],
  status: 'open',
  // The documented tags item example is the single string 'new_customer, sales'.
  tags: ['new_customer, sales'],
  assignee: { id: 12345, firstName: 'Muhammad Mahin', lastName: 'Dar', email: 'test@example.com' },
  lifecycle: 'Hot Lead',
  created_at: 1663274081,
  isBlocked: false,
}

function makeRaw(overrides: Partial<RawRespondIoContact> = {}): RawRespondIoContact {
  return { id: 101, ...overrides }
}

describe('respond-io transformContact', () => {
  it('maps the documented example to a schema-valid Contact', () => {
    const c = ContactSchema.parse(transformContact(DOCUMENTED))
    expect(c).toMatchObject({
      id: '12345',
      first_name: 'Muhammad ',
      last_name: 'Mahin',
      name: 'Muhammad Mahin',
      email: 'test@example.com',
      phone: '+60123456789',
      owner_id: '12345',
      stage: 'Hot Lead',
      tags: ['new_customer, sales'],
      created_at: '2022-09-15T20:34:41.000Z',
    })
    expect(c.updated_at).toBeUndefined()
    expect(c.metadata).toEqual(DOCUMENTED)
  })

  it('maps assignee.id to owner_id, and a null assignee to none', () => {
    expect(
      transformContact(
        makeRaw({ assignee: { id: 99, firstName: 'A', lastName: 'B', email: 'a@b.test' } }),
      ).owner_id,
    ).toBe('99')
    expect(transformContact(makeRaw({ assignee: null })).owner_id).toBeUndefined()
  })

  it('converts created_at from unix seconds', () => {
    // 1_700_000_000 seconds = 2023-11-14T22:13:20.000Z
    expect(transformContact(makeRaw({ created_at: 1_700_000_000 })).created_at).toBe(
      '2023-11-14T22:13:20.000Z',
    )
    expect(transformContact(makeRaw()).created_at).toBeUndefined()
  })

  it('maps null lastName, phone and email (all documented nullable) to schema-valid output', () => {
    const c = ContactSchema.parse(
      transformContact(
        makeRaw({ firstName: 'Solo', lastName: null, phone: null, email: null, lifecycle: null }),
      ),
    )
    expect(c.name).toBe('Solo')
    expect(c.last_name).toBeNull()
    expect(c.email).toBeNull()
    expect(c.stage).toBeNull()
  })

  it('returns undefined tags when the array is empty', () => {
    expect(transformContact(makeRaw({ tags: [] })).tags).toBeUndefined()
  })
})

describe('respond-io untransformContact', () => {
  it('maps first_name to firstName', () => {
    expect(untransformContact({ first_name: 'Alice' })).toMatchObject({ firstName: 'Alice' })
  })

  it('maps email and phone', () => {
    const result = untransformContact({ email: 'a@example.com', phone: '+1555' })
    expect(result.email).toBe('a@example.com')
    expect(result.phone).toBe('+1555')
  })

  it('maps tags array', () => {
    expect(untransformContact({ tags: ['vip'] })).toMatchObject({ tags: ['vip'] })
  })

  it('omits undefined fields', () => {
    const result = untransformContact({})
    expect(result).not.toHaveProperty('firstName')
    expect(result).not.toHaveProperty('email')
  })
})
