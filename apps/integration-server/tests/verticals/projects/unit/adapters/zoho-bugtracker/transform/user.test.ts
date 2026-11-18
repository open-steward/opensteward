import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawZohoBugtrackerUser,
} from '../../../../../../../src/verticals/projects/adapters/zoho-bugtracker/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('zoho-bugtracker transformUser', () => {
  const raw: RawZohoBugtrackerUser = {
    id: 55,
    zpuid: 999,
    name: 'Alice Smith',
    email: 'alice@example.com',
    role: 'admin',
    role_id: '1',
    role_name: 'Administrator',
    profile_id: '10',
    profile_name: 'Owner',
    active: true,
  }

  it('uses string of id when present', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('55')
    expect(result.externalId).toBe('55')
  })

  it('falls back to string of zpuid when id absent', () => {
    const result = transformUser({ ...raw, id: undefined })
    expect(result.id).toBe('999')
  })

  it('id is empty string when both id and zpuid absent', () => {
    const result = transformUser({ ...raw, id: undefined, zpuid: undefined })
    expect(result.id).toBe('')
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

  it('maps workspaceIds when portalId provided', () => {
    const result = transformUser(raw, 'portal-1')
    expect(result.workspaceIds).toEqual(['portal-1'])
  })

  it('workspaceIds is empty when portalId not provided', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is zoho-bugtracker', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('zoho-bugtracker')
  })

  it('metadata includes role, roleName, profileName, active', () => {
    const result = transformUser(raw)
    expect(result.metadata.role).toBe('admin')
    expect(result.metadata.roleName).toBe('Administrator')
    expect(result.metadata.profileName).toBe('Owner')
    expect(result.metadata.active).toBe('true')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw, 'portal-1')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
