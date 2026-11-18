import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawAirtableUser,
} from '../../../../../../../src/verticals/projects/adapters/zenkit/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('zenkit transformUser', () => {
  const raw: RawAirtableUser = {
    gid: 'user-gid-1',
    name: 'Alice Smith',
    email: 'alice@example.com',
    workspaces: [{ gid: 'ws-1' }, { gid: 'ws-2' }],
  }

  it('maps id and externalId from gid', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('user-gid-1')
    expect(result.externalId).toBe('user-gid-1')
  })

  it('maps name', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Alice Smith')
  })

  it('name is empty string when absent', () => {
    const result = transformUser({ ...raw, name: undefined })
    expect(result.name).toBe('')
  })

  it('maps email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('alice@example.com')
  })

  it('email is undefined when absent', () => {
    const result = transformUser({ ...raw, email: undefined })
    expect(result.email).toBeUndefined()
  })

  it('maps workspaceIds from workspaces when no argument', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual(['ws-1', 'ws-2'])
  })

  it('uses provided workspaceId arg instead of workspaces', () => {
    const result = transformUser(raw, 'override-ws')
    expect(result.workspaceIds).toEqual(['override-ws'])
  })

  it('workspaceIds is empty when workspaces absent and no arg', () => {
    const result = transformUser({ ...raw, workspaces: undefined })
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is zenkit', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('zenkit')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
