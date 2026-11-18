import { describe, it, expect } from 'vitest'
import {
  transformUser,
  transformMembershipUser,
  type RawTaigaMembership,
  type RawTaigaUser,
} from '../../../../../../../src/verticals/projects/adapters/taiga/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('taiga transformUser', () => {
  const raw: RawTaigaUser = {
    id: 5,
    username: 'alice',
    full_name: 'Alice Smith',
    full_name_display: 'Alice Smith (admin)',
    email: 'alice@example.com',
    bio: 'Project lead',
    lang: 'en',
    timezone: 'Europe/London',
    is_active: true,
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('5')
    expect(result.externalId).toBe('5')
  })

  it('maps email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('alice@example.com')
  })

  it('uses full_name_display as name when present', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Alice Smith (admin)')
  })

  it('falls back to full_name when full_name_display is absent', () => {
    const result = transformUser({ ...raw, full_name_display: undefined })
    expect(result.name).toBe('Alice Smith')
  })

  it('falls back to username when full_name is also absent', () => {
    const result = transformUser({ id: 1, username: 'bob' })
    expect(result.name).toBe('bob')
  })

  it('workspaceIds includes workspaceId when passed', () => {
    const result = transformUser(raw, 'ws-88')
    expect(result.workspaceIds).toEqual(['ws-88'])
  })

  it('workspaceIds is empty when no workspaceId passed', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('stores username in metadata', () => {
    const result = transformUser(raw)
    expect(result.metadata.username).toBe('alice')
  })

  it('platform is taiga', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('taiga')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})

describe('taiga transformMembershipUser', () => {
  // The documented "Membership detail" example (https://docs.taiga.io/api.html).
  const raw: RawTaigaMembership = {
    color: '#002e33',
    created_at: '2020-07-02T11:56:20.444Z',
    email: 'user8@taigaio.demo',
    full_name: 'Miguel Molina',
    gravatar_id: 'dce0e8ed702cd85d5132e523121e619b',
    id: 1,
    invitation_extra_text: null,
    invited_by: null,
    is_admin: true,
    is_owner: false,
    is_user_active: true,
    photo: null,
    project: 1,
    project_name: 'Project Example 0',
    project_slug: 'project-0',
    role: 5,
    role_name: 'Product Owner',
    user: 14,
    user_email: 'user8@taigaio.demo',
    user_order: 6,
  }

  it('maps the member to a canonical User keyed by the user id', () => {
    const result = UserSchema.parse(transformMembershipUser(raw, '1'))
    expect(result).toMatchObject({
      id: '14',
      externalId: '14',
      name: 'Miguel Molina',
      email: 'user8@taigaio.demo',
      workspaceIds: ['1'],
      platform: 'taiga',
    })
    expect(result.metadata).toEqual({
      membershipId: '1',
      projectId: '1',
      role: 'Product Owner',
      isAdmin: 'true',
      isOwner: 'false',
      isUserActive: 'true',
    })
  })

  it('reads the email from user_email only (absent for non-admin callers)', () => {
    const { user_email: _omit, ...noUserEmail } = raw
    const result = UserSchema.parse(transformMembershipUser(noUserEmail as RawTaigaMembership, '1'))
    expect(result.email).toBeUndefined()
  })

  it('throws when a real member carries no full_name rather than inventing a name', () => {
    expect(() => transformMembershipUser({ ...raw, full_name: null }, '1')).toThrow(/full_name/)
  })

  it('throws on a pending invitation (user null), which is not a user', () => {
    expect(() => transformMembershipUser({ ...raw, user: null, full_name: null }, '1')).toThrow(
      /invitation/,
    )
  })
})
