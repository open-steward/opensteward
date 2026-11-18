import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawBaserowUser,
} from '../../../../../../../src/verticals/projects/adapters/baserow/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('baserow transformUser', () => {
  const raw: RawBaserowUser = {
    id: 5,
    name: 'Jane Doe',
    email: 'jane@example.com',
    permissions: 'ADMIN',
    created_on: '2025-01-15T08:00:00.000Z',
  }

  it('maps id and name', () => {
    const result = transformUser(raw, 'ws_1')
    expect(result.id).toBe('5')
    expect(result.name).toBe('Jane Doe')
  })

  it('maps email', () => {
    const result = transformUser(raw, 'ws_1')
    expect(result.email).toBe('jane@example.com')
  })

  it('workspaceIds contains the provided workspaceId', () => {
    const result = transformUser(raw, 'ws_1')
    expect(result.workspaceIds).toEqual(['ws_1'])
  })

  it('platform is baserow', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('baserow')
  })

  it('metadata includes permissions', () => {
    const result = transformUser(raw, 'ws_1')
    expect(result.metadata.permissions).toBe('ADMIN')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw, 'ws_1')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('id falls back to email when id absent', () => {
    const result = transformUser({ email: 'fallback@example.com' })
    expect(result.id).toBe('fallback@example.com')
  })
})
