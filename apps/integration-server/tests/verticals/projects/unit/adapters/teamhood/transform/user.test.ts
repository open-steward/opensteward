import { describe, it, expect } from 'vitest'
import { transformUser } from '../../../../../../../src/verticals/projects/adapters/teamhood/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'
import { DOC_USERS_RESPONSE } from '../fixtures'

describe('teamhood transformUser (documented Entities.User example)', () => {
  const raw = { ...DOC_USERS_RESPONSE.users[0]!, accessibleWorkspaces: ['ws-1', 'ws-2'] }

  it('parses with UserSchema and maps the documented fields', () => {
    const u = UserSchema.parse(transformUser(raw))
    expect(u).toMatchObject({
      id: '2466ba93-0b3a-436e-a495-50767c5b1a10',
      externalId: '2466ba93-0b3a-436e-a495-50767c5b1a10',
      email: 'john@teamhood.com',
      name: 'John Hood',
      workspaceIds: ['ws-1', 'ws-2'],
      platform: 'teamhood',
      metadata: { status: 'Active', lastActivityDate: '2026-09-20T01:28:17.773Z' },
    })
  })

  it('has no workspaces when accessibleWorkspaces is null or absent', () => {
    expect(UserSchema.parse(transformUser(DOC_USERS_RESPONSE.users[0]!)).workspaceIds).toEqual([])
    expect(transformUser({ ...raw, accessibleWorkspaces: null }).workspaceIds).toEqual([])
  })

  it('names a user with no first or last name by email', () => {
    expect(transformUser({ ...raw, firstName: null, lastName: null }).name).toBe(
      'john@teamhood.com',
    )
  })
})
