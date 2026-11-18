import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawWekanUser,
} from '../../../../../../../src/verticals/projects/adapters/wekan/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'
import { VIRTUAL_WORKSPACE_ID } from '../../../../../../../src/verticals/projects/adapters/wekan/constants'

describe('wekan transformUser', () => {
  const raw: RawWekanUser = {
    _id: 'user-42',
    username: 'jdoe',
    emails: [{ address: 'jdoe@example.com', verified: true }],
    profile: { fullname: 'Jane Doe', initials: 'JD' },
    isAdmin: false,
    loginDisabled: false,
    createdAt: '2023-06-01T00:00:00.000Z',
  }

  it('maps id and externalId from _id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('user-42')
    expect(result.externalId).toBe('user-42')
  })

  it('maps name from profile.fullname', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('falls back to username when fullname absent', () => {
    const result = transformUser({ ...raw, profile: undefined })
    expect(result.name).toBe('jdoe')
  })

  it('maps email from emails[0].address', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jdoe@example.com')
  })

  it('workspaceIds contains VIRTUAL_WORKSPACE_ID', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([VIRTUAL_WORKSPACE_ID])
  })

  it('platform is wekan', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('wekan')
  })

  it('metadata contains username and isAdmin', () => {
    const result = transformUser(raw)
    expect(result.metadata.username).toBe('jdoe')
    expect(result.metadata.isAdmin).toBe('false')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
