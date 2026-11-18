import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawProjectplaceMember,
} from '../../../../../../../src/verticals/projects/adapters/projectplace/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('projectplace transformUser', () => {
  const raw: RawProjectplaceMember = {
    id: 444,
    name: 'Jack Nimble',
    first_name: 'Jack',
    last_name: 'Nimble',
    email: 'jack.nimble@example.com',
    role: 'member',
    type: 'user',
  }

  it('maps id as string', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('444')
    expect(result.externalId).toBe('444')
  })

  it('prefers name field over first_name+last_name', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jack Nimble')
  })

  it('composes name from first_name+last_name when name absent', () => {
    const noName: RawProjectplaceMember = { id: 2, first_name: 'Luna', last_name: 'Park' }
    const result = transformUser(noName)
    expect(result.name).toBe('Luna Park')
  })

  it('maps email correctly', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jack.nimble@example.com')
  })

  it('workspaceIds includes workspaceId when provided', () => {
    const result = transformUser(raw, 'proj-7777')
    expect(result.workspaceIds).toEqual(['proj-7777'])
  })

  it('workspaceIds is empty array when not provided', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is projectplace', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('projectplace')
  })

  it('metadata includes role and type', () => {
    const result = transformUser(raw)
    expect(result.metadata.role).toBe('member')
    expect(result.metadata.type).toBe('user')
  })

  it('name falls back to empty string when all name fields absent', () => {
    const result = transformUser({ id: 3 })
    expect(result.name).toBe('')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw, 'proj-77')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
