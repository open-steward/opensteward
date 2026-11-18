import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawPerdooUser,
} from '../../../../../../../src/verticals/projects/adapters/perdoo/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('perdoo transformUser', () => {
  const raw: RawPerdooUser = {
    id: 'user-42',
    name: 'Jane Doe',
    email: 'jane.doe@acme.example',
    role: 'ADMIN',
    isActive: true,
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('user-42')
    expect(result.externalId).toBe('user-42')
  })

  it('maps name from raw.name', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('maps email from raw.email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane.doe@acme.example')
  })

  it('email is undefined when raw.email is absent', () => {
    const result = transformUser({ id: 'user-no-email', name: 'No Email User' })
    expect(result.email).toBeUndefined()
  })

  it('workspaceIds contains groupId when provided', () => {
    const result = transformUser(raw, 'group-sales')
    expect(result.workspaceIds).toEqual(['group-sales'])
  })

  it('workspaceIds is empty array when no groupId provided', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is perdoo', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('perdoo')
  })

  it('metadata includes role', () => {
    const result = transformUser(raw)
    expect(result.metadata.role).toBe('ADMIN')
  })

  it('metadata includes isActive as string', () => {
    const result = transformUser(raw)
    expect(result.metadata.isActive).toBe('true')
  })

  it('metadata omits null role', () => {
    const result = transformUser({ ...raw, role: null })
    expect(result.metadata.role).toBeUndefined()
  })

  it('name falls back to empty string when raw.name is absent', () => {
    const result = transformUser({ id: 'user-no-name' })
    expect(result.name).toBe('')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
