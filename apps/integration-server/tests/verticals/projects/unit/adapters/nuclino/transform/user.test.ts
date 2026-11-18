import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawNuclinoUser,
} from '../../../../../../../src/verticals/projects/adapters/nuclino/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

function makeUser(overrides: Partial<RawNuclinoUser> = {}): RawNuclinoUser {
  return {
    object: 'user',
    id: 'usr-nuclino-1',
    firstName: 'Alice',
    lastName: 'Wonder',
    email: 'alice@acme.example',
    avatarUrl: 'https://example.com/avatar.png',
    ...overrides,
  }
}

describe('nuclino transformUser', () => {
  it('maps id and externalId from raw.id', () => {
    const result = transformUser(makeUser())
    expect(result.id).toBe('usr-nuclino-1')
    expect(result.externalId).toBe('usr-nuclino-1')
  })

  it('composes name from firstName and lastName', () => {
    const result = transformUser(makeUser())
    expect(result.name).toBe('Alice Wonder')
  })

  it('uses only firstName when lastName is absent', () => {
    const result = transformUser(makeUser({ lastName: undefined }))
    expect(result.name).toBe('Alice')
  })

  it('falls back to raw.id when both names are absent', () => {
    const result = transformUser(makeUser({ firstName: undefined, lastName: undefined }))
    expect(result.name).toBe('usr-nuclino-1')
  })

  it('maps email from raw.email', () => {
    const result = transformUser(makeUser())
    expect(result.email).toBe('alice@acme.example')
  })

  it('email is undefined when absent', () => {
    const result = transformUser(makeUser({ email: undefined }))
    expect(result.email).toBeUndefined()
  })

  it('workspaceIds is [teamId] when explicit teamId arg provided', () => {
    const result = transformUser(makeUser(), 'team-alpha')
    expect(result.workspaceIds).toEqual(['team-alpha'])
  })

  it('workspaceIds is empty when no teamId arg', () => {
    const result = transformUser(makeUser())
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is nuclino', () => {
    const result = transformUser(makeUser())
    expect(result.platform).toBe('nuclino')
  })

  it('metadata.avatarUrl reflects raw.avatarUrl', () => {
    const result = transformUser(makeUser())
    expect(result.metadata.avatarUrl).toBe('https://example.com/avatar.png')
  })

  it('metadata.firstName reflects raw.firstName', () => {
    const result = transformUser(makeUser())
    expect(result.metadata.firstName).toBe('Alice')
  })

  it('metadata.lastName reflects raw.lastName', () => {
    const result = transformUser(makeUser())
    expect(result.metadata.lastName).toBe('Wonder')
  })

  it('passes UserSchema.parse without throwing', () => {
    const result = transformUser(makeUser())
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
