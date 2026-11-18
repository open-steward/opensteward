/**
 * Fixture fields are the UserModelWithSkills properties declared in
 * https://app.go.easyprojects.net/api/swagger/v2/swagger.json.
 */
import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawBirdviewUser,
} from '../../../../../../../src/verticals/projects/adapters/birdview/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

const raw: RawBirdviewUser = {
  UserId: 42,
  Login: 'alice',
  Name: 'Alice Smith',
  EMail: 'alice@example.com',
  Enabled: true,
  CanLogin: true,
  HourlyRate: 100,
  HourlyRateInternal: 60,
  LastActivityDate: null,
  LastModificationDate: '2025-01-01T00:00:00Z',
  TimeZoneOffset: null,
  CreationDate: '2024-01-01T00:00:00Z',
  CustomerId: null,
  RoleId: 1,
  JobRoleId: null,
  ReportingManagerId: null,
  CustomFields: {},
  Skills: [],
}

describe('birdview transformUser', () => {
  it('maps the documented UserModel fields and passes UserSchema', () => {
    const u = UserSchema.parse(transformUser(raw))
    expect(u).toMatchObject({
      id: '42',
      externalId: '42',
      email: 'alice@example.com',
      name: 'Alice Smith',
      workspaceIds: [],
      platform: 'birdview',
      metadata: { enabled: 'true', canLogin: 'true' },
    })
  })

  it('omits an EMail that is not an address', () => {
    const u = UserSchema.parse(transformUser({ ...raw, EMail: '' }))
    expect(u.email).toBeUndefined()
  })

  it('reads UserId, never Id', () => {
    const noId = { ...raw } as Record<string, unknown>
    delete noId['UserId']
    expect(() => transformUser(noId as unknown as RawBirdviewUser)).toThrow(/UserId/)
  })
})
