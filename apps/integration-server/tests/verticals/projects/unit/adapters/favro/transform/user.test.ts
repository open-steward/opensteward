import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawFavroUser,
} from '../../../../../../../src/verticals/projects/adapters/favro/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('favro transformUser', () => {
  const raw: RawFavroUser = {
    userId: 'user-favro-1',
    name: 'Alice Smith',
    email: 'alice.smith@acme.example',
    organizationRole: 'fullMember',
  }

  it('maps id and externalId from userId', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('user-favro-1')
    expect(result.externalId).toBe('user-favro-1')
  })

  it('maps email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('alice.smith@acme.example')
  })

  it('maps name', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Alice Smith')
  })

  it('workspaceIds uses caller-supplied workspaceId', () => {
    const result = transformUser(raw, 'org-xyz')
    expect(result.workspaceIds).toEqual(['org-xyz'])
  })

  it('workspaceIds is empty when not supplied', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is favro', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('favro')
  })

  it('metadata.organizationRole reflects organizationRole', () => {
    const result = transformUser(raw)
    expect(result.metadata.organizationRole).toBe('fullMember')
  })

  it('email is undefined when absent', () => {
    const result = transformUser({ userId: 'u1', name: 'Bob' })
    expect(result.email).toBeUndefined()
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw, 'org-xyz')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
