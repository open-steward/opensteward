import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawOraUser,
} from '../../../../../../../src/verticals/projects/adapters/ora/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('ora transformUser', () => {
  const raw: RawOraUser = {
    id: 'usr_10',
    username: 'jdoe',
    full_name: 'Jane Doe',
    email: 'jane@example.com',
  }

  it('maps id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('usr_10')
    expect(result.externalId).toBe('usr_10')
  })

  it('prefers full_name over username for name', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('falls back to username when full_name is absent', () => {
    const result = transformUser({ id: 1, username: 'jdoe' })
    expect(result.name).toBe('jdoe')
  })

  it('maps email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane@example.com')
  })

  it('maps workspaceId when provided', () => {
    const result = transformUser(raw, 'org_10')
    expect(result.workspaceIds).toEqual(['org_10'])
  })

  it('workspaceIds is empty when not provided', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('metadata includes username', () => {
    const result = transformUser(raw)
    expect(result.metadata.username).toBe('jdoe')
  })

  it('platform is ora', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('ora')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw, 'org_10')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
