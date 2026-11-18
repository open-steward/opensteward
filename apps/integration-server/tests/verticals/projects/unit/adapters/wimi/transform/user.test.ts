import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawLinearUser,
} from '../../../../../../../src/verticals/projects/adapters/wimi/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('wimi transformUser', () => {
  const raw: RawLinearUser = {
    gid: 'user-5',
    name: 'Alice Smith',
    email: 'alice@example.com',
    workspaces: [{ gid: 'ws-10' }, { gid: 'ws-11' }],
  }

  it('maps id and externalId from gid', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('user-5')
    expect(result.externalId).toBe('user-5')
  })

  it('maps name', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Alice Smith')
  })

  it('maps email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('alice@example.com')
  })

  it('workspaceIds come from workspaces array', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual(['ws-10', 'ws-11'])
  })

  it('explicit workspaceId param overrides workspaces array', () => {
    const result = transformUser(raw, 'ws-override')
    expect(result.workspaceIds).toEqual(['ws-override'])
  })

  it('platform is wimi', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('wimi')
  })

  it('workspaceIds is empty when workspaces absent and no param', () => {
    const result = transformUser({ ...raw, workspaces: undefined })
    expect(result.workspaceIds).toEqual([])
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
