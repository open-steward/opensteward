/**
 * Thena user transform, over a `hits[].document` of GET /v1/search/users built
 * from the documented fields of https://docs.thena.ai/api-reference/search/users-search.md
 * ("Core fields", "Default extended fields", "Team structure").
 */
import { describe, expect, it } from 'vitest'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema/user'
import {
  transformUser,
  type RawThenaUser,
} from '../../../../../../../src/verticals/customer-support/adapters/thena/transform/user'

const documentedUser: RawThenaUser = {
  id: 'URR9A99BDJ',
  uid: 'URR9A99BDJ',
  authId: 'auth_123',
  organizationId: 'ORG123',
  name: 'Jane Agent',
  email: 'jane.agent@company.com',
  userType: 'ORG_ADMIN',
  isActive: true,
  status: 'ACTIVE',
  primaryTeamId: 'T1HQXYZ123456789',
  lastLoginAt: '2025-07-24T10:00:00.000Z',
  metadata: {},
  avatarUrl: 'https://example.com/avatar.jpg',
  timezone: 'UTC',
  externalSinks: [],
  createdAt: '2025-07-24T07:19:10.258Z',
  updatedAt: '2025-07-24T08:19:10.258Z',
  teams: [
    { id: 'T1HQXYZ123456789', name: 'Support' },
    { id: 'T2HQXYZ123456789', name: 'Escalations' },
  ],
  sidebarPreferences: {},
}

describe('Thena user transform (search users document)', () => {
  it('parses with the canonical UserSchema', () => {
    expect(() => UserSchema.parse(transformUser(documentedUser))).not.toThrow()
  })

  it('maps id, name, email, userType and the team ids', () => {
    const u = UserSchema.parse(transformUser(documentedUser))
    expect(u.id).toBe('URR9A99BDJ')
    expect(u.externalId).toBe('URR9A99BDJ')
    expect(u.name).toBe('Jane Agent')
    expect(u.email).toBe('jane.agent@company.com')
    expect(u.role).toBe('ORG_ADMIN')
    expect(u.teamIds).toEqual(['T1HQXYZ123456789', 'T2HQXYZ123456789'])
    expect(u.platform).toBe('thena')
  })

  it('carries status, activity, timezone and timestamps in metadata', () => {
    const u = UserSchema.parse(transformUser(documentedUser))
    expect(u.metadata).toMatchObject({
      uid: 'URR9A99BDJ',
      status: 'ACTIVE',
      isActive: 'true',
      timezone: 'UTC',
      primaryTeamId: 'T1HQXYZ123456789',
      lastLoginAt: '2025-07-24T10:00:00.000Z',
      createdAt: '2025-07-24T07:19:10.258Z',
      updatedAt: '2025-07-24T08:19:10.258Z',
    })
  })

  it('a user with no teams has an empty teamIds', () => {
    const { teams: _t, ...noTeams } = documentedUser
    expect(UserSchema.parse(transformUser(noTeams as RawThenaUser)).teamIds).toEqual([])
  })

  it('drops an email that is not an address instead of failing the schema', () => {
    const u = UserSchema.parse(
      transformUser({ ...documentedUser, userType: 'BOT_USER', email: 'bot' }),
    )
    expect(u.email).toBeUndefined()
  })
})
