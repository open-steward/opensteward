import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawSeatableUser,
} from '../../../../../../../src/verticals/projects/adapters/seatable/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('seatable transformUser', () => {
  const raw: RawSeatableUser = {
    email: 'alice@example.com',
    name: 'Alice Smith',
    avatar_url: 'https://example.com/avatars/alice.png',
    contact_email: 'alice.smith@corp.example.com',
  }

  it('uses email as the canonical id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('alice@example.com')
    expect(result.externalId).toBe('alice@example.com')
  })

  it('maps email from raw.email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('alice@example.com')
  })

  it('maps name from raw.name', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Alice Smith')
  })

  it('name falls back to id (email) when name is absent', () => {
    const result = transformUser({ email: 'bob@example.com' })
    expect(result.name).toBe('bob@example.com')
  })

  it('workspaceIds includes workspaceId param when provided', () => {
    const result = transformUser(raw, 'ws-9')
    expect(result.workspaceIds).toEqual(['ws-9'])
  })

  it('workspaceIds is empty when no param provided', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('stores avatarUrl in metadata', () => {
    const result = transformUser(raw)
    expect(result.metadata.avatarUrl).toBe('https://example.com/avatars/alice.png')
  })

  it('stores contactEmail in metadata', () => {
    const result = transformUser(raw)
    expect(result.metadata.contactEmail).toBe('alice.smith@corp.example.com')
  })

  it('platform is seatable', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('seatable')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
