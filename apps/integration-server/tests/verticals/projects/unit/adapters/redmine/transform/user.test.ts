import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawRedmineUser,
} from '../../../../../../../src/verticals/projects/adapters/redmine/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('redmine transformUser', () => {
  const raw: RawRedmineUser = {
    id: 7,
    login: 'alice',
    firstname: 'Alice',
    lastname: 'Smith',
    mail: 'alice@example.com',
    created_on: '2024-01-01T00:00:00.000Z',
    last_login_on: '2024-06-15T09:00:00.000Z',
    status: 1,
    avatar_url: 'https://example.com/avatar.png',
  }

  it('maps id to string', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
  })

  it('joins firstname and lastname with a space', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Alice Smith')
  })

  it('falls back to login when firstname and lastname are absent', () => {
    const result = transformUser({ id: 7, login: 'alice' })
    expect(result.name).toBe('alice')
  })

  it('uses only firstname when lastname is absent', () => {
    const result = transformUser({ id: 7, firstname: 'Alice', login: 'alice' })
    expect(result.name).toBe('Alice')
  })

  it('uses only lastname when firstname is absent', () => {
    const result = transformUser({ id: 7, lastname: 'Smith', login: 'alice' })
    expect(result.name).toBe('Smith')
  })

  it('maps email from mail', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('alice@example.com')
  })

  it('email is undefined when mail is absent', () => {
    const result = transformUser({ id: 7, login: 'alice' })
    expect(result.email).toBeUndefined()
  })

  it('workspaceIds is always an empty array', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is redmine', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('redmine')
  })

  it('metadata includes login', () => {
    const result = transformUser(raw)
    expect(result.metadata.login).toBe('alice')
  })

  it('metadata includes status', () => {
    const result = transformUser(raw)
    expect(result.metadata.status).toBe('1')
  })

  it('metadata includes lastLoginOn as ISO string', () => {
    const result = transformUser(raw)
    expect(result.metadata.lastLoginOn).toBe('2024-06-15T09:00:00.000Z')
  })

  it('metadata includes avatarUrl', () => {
    const result = transformUser(raw)
    expect(result.metadata.avatarUrl).toBe('https://example.com/avatar.png')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
