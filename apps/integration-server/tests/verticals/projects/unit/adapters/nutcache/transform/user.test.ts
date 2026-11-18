import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawNutcacheMember,
} from '../../../../../../../src/verticals/projects/adapters/nutcache/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('nutcache transformUser', () => {
  const raw: RawNutcacheMember = {
    id: 200,
    member: 300,
    name: 'Jane Doe',
    email: 'jane@example.com',
    display_color: '#3F51B5',
    status: 1,
    project: 101,
    billing_rate: 75,
  }

  it('prefers member id over id when member is present', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('300')
    expect(result.externalId).toBe('300')
  })

  it('falls back to id when member is absent', () => {
    const result = transformUser({ id: 200 })
    expect(result.id).toBe('200')
  })

  it('maps name and email', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
    expect(result.email).toBe('jane@example.com')
  })

  it('maps workspaceId when provided', () => {
    const result = transformUser(raw, 'ws_55')
    expect(result.workspaceIds).toEqual(['ws_55'])
  })

  it('workspaceIds is empty when not provided', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('metadata includes projectMemberId (raw id) and displayColor', () => {
    const result = transformUser(raw)
    expect(result.metadata.projectMemberId).toBe('200')
    expect(result.metadata.displayColor).toBe('#3F51B5')
  })

  it('platform is nutcache', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('nutcache')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw, 'ws_55')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
