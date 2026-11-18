import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawAhaUser,
} from '../../../../../../../src/verticals/projects/adapters/aha/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('aha transformUser', () => {
  const raw: RawAhaUser = {
    id: 'usr-42',
    name: 'Alice Smith',
    first_name: 'Alice',
    last_name: 'Smith',
    email: 'alice@acme.example',
    enabled: true,
    created_at: '2024-01-01T00:00:00Z',
  }

  it('maps id and externalId', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('usr-42')
    expect(result.externalId).toBe('usr-42')
  })

  it('name prefers combined name field', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Alice Smith')
  })

  it('name falls back to first_name + last_name when name is absent', () => {
    const result = transformUser({ ...raw, name: undefined })
    expect(result.name).toBe('Alice Smith')
  })

  it('maps email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('alice@acme.example')
  })

  it('workspaceIds is empty when no workspaceId arg given', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('workspaceIds contains caller-supplied workspaceId', () => {
    const result = transformUser(raw, 'ws-100')
    expect(result.workspaceIds).toEqual(['ws-100'])
  })

  it('platform is aha', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('aha')
  })

  it('metadata.enabled is set', () => {
    const result = transformUser(raw)
    expect(result.metadata.enabled).toBe('true')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('email is undefined when absent', () => {
    const result = transformUser({ id: 'u1', name: 'Bob' })
    expect(result.email).toBeUndefined()
  })
})
