import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawVikunjaUser,
} from '../../../../../../../src/verticals/projects/adapters/vikunja/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('vikunja transformUser', () => {
  const raw: RawVikunjaUser = {
    id: 3,
    name: 'Alice Smith',
    username: 'alice',
    email: 'alice@example.com',
    created: '2024-01-10T08:00:00.000Z',
    updated: '2024-05-01T10:00:00.000Z',
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('3')
    expect(result.externalId).toBe('3')
  })

  it('maps name from name field', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Alice Smith')
  })

  it('falls back to username when name is absent', () => {
    const r: RawVikunjaUser = { id: 4, username: 'bob' }
    const result = transformUser(r)
    expect(result.name).toBe('bob')
  })

  it('name is empty string when both name and username are absent', () => {
    const r: RawVikunjaUser = { id: 5 }
    const result = transformUser(r)
    expect(result.name).toBe('')
  })

  it('maps email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('alice@example.com')
  })

  it('email is undefined when absent', () => {
    const r: RawVikunjaUser = { id: 6, name: 'No Email' }
    const result = transformUser(r)
    expect(result.email).toBeUndefined()
  })

  it('workspaceIds contains caller-supplied workspaceId', () => {
    const result = transformUser(raw, 'ws-99')
    expect(result.workspaceIds).toEqual(['ws-99'])
  })

  it('workspaceIds is empty array when no workspaceId supplied', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is vikunja', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('vikunja')
  })

  it('metadata contains username', () => {
    const result = transformUser(raw)
    expect(result.metadata.username).toBe('alice')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw, 'ws-10')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
