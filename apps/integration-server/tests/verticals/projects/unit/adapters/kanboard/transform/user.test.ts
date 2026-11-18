import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawKanboardUser,
} from '../../../../../../../src/verticals/projects/adapters/kanboard/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('kanboard transformUser', () => {
  const raw: RawKanboardUser = {
    id: '5',
    username: 'bob',
    name: 'Bob Builder',
    email: 'bob@example.com',
    role: 'app-user',
    is_ldap_user: false,
    notifications_enabled: true,
  }

  it('maps id as string', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('5')
    expect(result.externalId).toBe('5')
  })

  it('maps name from name field', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Bob Builder')
  })

  it('falls back to username when name absent', () => {
    const result = transformUser({ ...raw, name: undefined })
    expect(result.name).toBe('bob')
  })

  it('maps email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('bob@example.com')
  })

  it('workspaceIds includes projectId when provided', () => {
    const result = transformUser(raw, 'proj-12')
    expect(result.workspaceIds).toEqual(['proj-12'])
  })

  it('workspaceIds is empty when no projectId', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is kanboard', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('kanboard')
  })

  it('metadata contains username and role', () => {
    const result = transformUser(raw)
    expect(result.metadata.username).toBe('bob')
    expect(result.metadata.role).toBe('app-user')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
