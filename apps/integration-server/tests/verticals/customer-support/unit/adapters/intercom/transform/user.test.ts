import { describe, it, expect } from 'vitest'
import { transformUser } from '../../../../../../../src/verticals/customer-support/adapters/intercom/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema/user'

describe('transformUser (Intercom admin)', () => {
  it('maps an admin and parses', () => {
    const u = UserSchema.parse(
      transformUser({
        type: 'admin',
        id: '991267459',
        name: 'Hermione Granger',
        email: 'hermione.granger@awesomecorp.io',
        job_title: 'Support lead',
        away_mode_enabled: false,
        has_inbox_seat: true,
        team_ids: [814865, 814866],
        role: { type: 'role', id: '1', name: 'Admin' },
      }),
    )
    expect(u).toMatchObject({
      id: '991267459',
      externalId: '991267459',
      name: 'Hermione Granger',
      email: 'hermione.granger@awesomecorp.io',
      role: 'Admin',
      teamIds: ['814865', '814866'],
      platform: 'intercom',
    })
    expect(u.metadata).toEqual({
      jobTitle: 'Support lead',
      hasInboxSeat: 'true',
      awayModeEnabled: 'false',
    })
  })

  it('an admin without a role or teams still parses', () => {
    const u = UserSchema.parse(
      transformUser({
        id: 7,
        name: 'Bot',
        email: 'operator+abcd1234@intercom.io',
        role: null,
        team_ids: null,
      }),
    )
    expect(u.role).toBeUndefined()
    expect(u.teamIds).toEqual([])
    expect(u.id).toBe('7')
  })
})
