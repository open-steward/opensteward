import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawOpenProjectUser,
} from '../../../../../../../src/verticals/projects/adapters/openproject/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('openproject transformUser', () => {
  const raw: RawOpenProjectUser = {
    _type: 'User',
    id: 42,
    login: 'alice.smith',
    firstName: 'Alice',
    lastName: 'Smith',
    name: 'Alice Smith',
    email: 'alice@example.com',
    admin: false,
    status: 'active',
    _links: {
      self: { href: '/api/v3/users/42', title: 'Alice Smith' },
    },
  }

  it('maps id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps name from name field when present', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Alice Smith')
  })

  it('constructs name from firstName + lastName when name is absent', () => {
    const result = transformUser({ ...raw, name: undefined })
    expect(result.name).toBe('Alice Smith')
  })

  it('maps email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('alice@example.com')
  })

  it('email is undefined when null', () => {
    const result = transformUser({ ...raw, email: null })
    expect(result.email).toBeUndefined()
  })

  it('workspaceIds is always empty (openproject has no workspace)', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('metadata includes login', () => {
    const result = transformUser(raw)
    expect(result.metadata.login).toBe('alice.smith')
  })

  it('metadata includes status', () => {
    const result = transformUser(raw)
    expect(result.metadata.status).toBe('active')
  })

  it('platform is openproject', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('openproject')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
