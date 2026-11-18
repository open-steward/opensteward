/**
 * Fixtures built from the documented user object of GET /wb/apis/user/{user_id}
 * and the `team_members` entries of GET /wb/apis/team?team_id=
 * (https://apidocs.myworkboard.com/openapi.json).
 */
import { describe, it, expect } from 'vitest'
import {
  transformTeamMember,
  transformUser,
  type RawWorkboardUser,
} from '../../../../../../../src/verticals/projects/adapters/workboard/transform/user'
import type { RawWorkboardTeamMember } from '../../../../../../../src/verticals/projects/adapters/workboard/transform/workspace'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

const user: RawWorkboardUser = {
  user_id: '55',
  user_name: 'ada',
  email: 'ada@example.com',
  first_name: 'Ada',
  last_name: 'Lovelace',
  wb_email: 'ada@wb.example.com',
  create_at: 1704153600,
  time_zone: 'UTC',
  org_id: '3',
  status: '1',
}

const member: RawWorkboardTeamMember = {
  id: '56',
  first_name: 'Grace',
  last_name: 'Hopper',
  email: 'grace@example.com',
  team_role: 'member',
}

describe('workboard transformUser', () => {
  it('maps the documented user fields and parses as a User', () => {
    const u = UserSchema.parse(transformUser(user))
    expect(u).toMatchObject({
      id: '55',
      externalId: '55',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      workspaceIds: [],
      platform: 'workboard',
    })
  })

  it('omits an empty email instead of failing the schema', () => {
    const u = UserSchema.parse(transformUser({ ...user, email: '' }))
    expect(u.email).toBeUndefined()
  })

  it('refuses a user with no user_id', () => {
    expect(() => transformUser({ ...user, user_id: undefined })).toThrow(/user_id/)
  })
})

describe('workboard transformTeamMember', () => {
  it('maps a documented team member and parses as a User of that team', () => {
    const u = UserSchema.parse(transformTeamMember(member, '77'))
    expect(u).toMatchObject({
      id: '56',
      externalId: '56',
      email: 'grace@example.com',
      name: 'Grace Hopper',
      workspaceIds: ['77'],
      metadata: { team_role: 'member' },
    })
  })

  it('refuses a member with no id', () => {
    expect(() => transformTeamMember({ ...member, id: undefined }, '77')).toThrow(
      /member has no id/,
    )
  })
})
