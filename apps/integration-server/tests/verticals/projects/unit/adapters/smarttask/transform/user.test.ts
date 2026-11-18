import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawSmarttaskUser,
} from '../../../../../../../src/verticals/projects/adapters/smarttask/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('smarttask transformUser', () => {
  const raw: RawSmarttaskUser = {
    user_id: 99,
    full_name: 'Alice Smith',
    email: 'alice@example.com',
    role: 'member',
    avatar_url: 'https://example.com/avatars/alice.png',
  }

  it('maps id and externalId from user_id as string', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('99')
    expect(result.externalId).toBe('99')
  })

  it('maps email from raw.email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('alice@example.com')
  })

  it('email is undefined when email is absent', () => {
    const result = transformUser({ user_id: 1 })
    expect(result.email).toBeUndefined()
  })

  it('maps name from full_name', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Alice Smith')
  })

  it('name is empty string when full_name is absent', () => {
    const result = transformUser({ user_id: 1 })
    expect(result.name).toBe('')
  })

  it('workspaceIds includes workspaceId param when provided', () => {
    const result = transformUser(raw, 'org-123')
    expect(result.workspaceIds).toEqual(['org-123'])
  })

  it('workspaceIds is empty when no param provided', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('stores role in metadata', () => {
    const result = transformUser(raw)
    expect(result.metadata.role).toBe('member')
  })

  it('platform is smarttask', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('smarttask')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
