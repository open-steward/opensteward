import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawBusinessmapUser,
} from '../../../../../../../src/verticals/projects/adapters/businessmap/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('businessmap transformUser', () => {
  const raw: RawBusinessmapUser = {
    user_id: 55,
    username: 'jdoe',
    email: 'jane.doe@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
    avatar: 'https://example.com/avatar.png',
    is_enabled: 1,
  }

  it('maps id and externalId from user_id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('55')
    expect(result.externalId).toBe('55')
  })

  it('maps email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane.doe@example.com')
  })

  it('builds name from first_name and last_name', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('falls back to username when first/last name absent', () => {
    const result = transformUser({ user_id: 1, username: 'jdoe' })
    expect(result.name).toBe('jdoe')
  })

  it('workspaceIds uses caller-supplied workspaceId', () => {
    const result = transformUser(raw, 'ws-5')
    expect(result.workspaceIds).toEqual(['ws-5'])
  })

  it('workspaceIds is empty when not supplied', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is businessmap', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('businessmap')
  })

  it('metadata.username reflects username', () => {
    const result = transformUser(raw)
    expect(result.metadata.username).toBe('jdoe')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw, 'ws-1')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
