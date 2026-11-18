import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawNotionUser,
} from '../../../../../../../src/verticals/projects/adapters/notion/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

function makeUser(overrides: Partial<RawNotionUser> = {}): RawNotionUser {
  return {
    object: 'user',
    id: 'usr-notion-1',
    type: 'person',
    name: 'Alice Wonder',
    avatar_url: 'https://example.com/avatar.png',
    person: { email: 'alice@acme.example' },
    ...overrides,
  }
}

describe('notion transformUser', () => {
  it('maps id and externalId from raw.id', () => {
    const result = transformUser(makeUser())
    expect(result.id).toBe('usr-notion-1')
    expect(result.externalId).toBe('usr-notion-1')
  })

  it('maps name from raw.name', () => {
    const result = transformUser(makeUser())
    expect(result.name).toBe('Alice Wonder')
  })

  it('name is empty string when raw.name is absent', () => {
    const result = transformUser(makeUser({ name: null }))
    expect(result.name).toBe('')
  })

  it('maps email from raw.person.email', () => {
    const result = transformUser(makeUser())
    expect(result.email).toBe('alice@acme.example')
  })

  it('email is undefined for bot users without person', () => {
    const result = transformUser(makeUser({ type: 'bot', person: undefined }))
    expect(result.email).toBeUndefined()
  })

  it('workspaceIds is [workspaceId] when explicit arg provided', () => {
    const result = transformUser(makeUser(), 'ws-99')
    expect(result.workspaceIds).toEqual(['ws-99'])
  })

  it('workspaceIds is empty when no arg', () => {
    const result = transformUser(makeUser())
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is notion', () => {
    const result = transformUser(makeUser())
    expect(result.platform).toBe('notion')
  })

  it('metadata.userType reflects raw.type', () => {
    const result = transformUser(makeUser())
    expect(result.metadata.userType).toBe('person')
  })

  it('metadata.avatarUrl reflects raw.avatar_url', () => {
    const result = transformUser(makeUser())
    expect(result.metadata.avatarUrl).toBe('https://example.com/avatar.png')
  })

  it('passes UserSchema.parse without throwing', () => {
    const result = transformUser(makeUser())
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
