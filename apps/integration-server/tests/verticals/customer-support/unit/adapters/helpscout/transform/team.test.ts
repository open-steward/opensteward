/**
 * Fixture: the documented example of
 * https://developer.helpscout.com/mailbox-api/endpoints/teams/list-teams/
 * (fetched 2026-09-28; _links trimmed).
 */
import { describe, it, expect } from 'vitest'
import {
  transformTeam,
  type RawHelpScoutTeam,
} from '../../../../../../../src/verticals/customer-support/adapters/helpscout/transform/team'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema/team'

const documented: RawHelpScoutTeam = {
  id: 4,
  name: 'Engineers',
  timezone: 'America/New_York',
  photoUrl: 'http://somesite.com/images/avatar.jpg',
  createdAt: '2011-04-01T03:18:33Z',
  updatedAt: '2012-07-24T20:18:33Z',
  mention: 'engs',
  initials: 'E',
}

describe('helpscout transformTeam', () => {
  it('parses the documented team against TeamSchema', () => {
    const out = TeamSchema.parse(transformTeam(documented))
    expect(out).toMatchObject({
      id: '4',
      externalId: '4',
      name: 'Engineers',
      platform: 'helpscout',
    })
    expect(out.memberCount).toBeUndefined()
    expect(out.metadata).toMatchObject({ mention: 'engs' })
  })
})
