/**
 * Fixture: the documented example of
 * https://developer.helpscout.com/mailbox-api/endpoints/users/get/
 * (fetched 2026-09-28; _links trimmed).
 */
import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawHelpScoutUser,
} from '../../../../../../../src/verticals/customer-support/adapters/helpscout/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema/user'

const documented: RawHelpScoutUser = {
  id: 4,
  firstName: 'Vernon',
  lastName: 'Bear',
  email: 'bear@acme.com',
  role: 'owner',
  timezone: 'America/New_York',
  photoUrl: 'http://somesite.com/images/avatar.jpg',
  createdAt: '2011-04-01T03:18:33Z',
  updatedAt: '2012-07-24T20:18:33Z',
  lastVisit: '2012-07-25T10:15:00Z',
  type: 'user',
  mention: 'vernon',
  initials: 'VB',
  jobTitle: 'Honey Master',
  phone: '555-2368',
  alternateEmails: ['bear@forest.com'],
}

describe('helpscout transformUser', () => {
  it('parses the documented user against UserSchema', () => {
    const out = UserSchema.parse(transformUser(documented))
    expect(out).toMatchObject({
      id: '4',
      externalId: '4',
      email: 'bear@acme.com',
      name: 'Vernon Bear',
      role: 'owner',
      teamIds: [],
      platform: 'helpscout',
    })
    expect(out.metadata).toMatchObject({ type: 'user', timezone: 'America/New_York' })
  })

  it('drops an email the schema would refuse', () => {
    const out = UserSchema.parse(transformUser({ ...documented, email: '' }))
    expect(out.email).toBeUndefined()
  })
})
