import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawFiberyUser,
} from '../../../../../../../src/verticals/projects/adapters/fibery/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('fibery transformUser', () => {
  const raw: RawFiberyUser = {
    'fibery/id': 'user-uuid-7777',
    'user/name': 'Bob Jones',
    'user/email': 'bob.jones@acme.example',
    workspaceId: 'ws-uuid-9999',
  }

  it('maps id and externalId from fibery/id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('user-uuid-7777')
    expect(result.externalId).toBe('user-uuid-7777')
  })

  it('maps name from user/name', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Bob Jones')
  })

  it('maps email from user/email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('bob.jones@acme.example')
  })

  it('uses workspaceId from the raw field when no arg is given', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual(['ws-uuid-9999'])
  })

  it('caller-supplied workspaceId overrides the raw field', () => {
    const result = transformUser(raw, 'override-ws-id')
    expect(result.workspaceIds).toEqual(['override-ws-id'])
  })

  it('workspaceIds is empty array when no workspaceId is available', () => {
    const result = transformUser({ 'fibery/id': 'user-uuid-7777', 'user/name': 'Bob' })
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is fibery', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('fibery')
  })

  it('email is undefined when user/email is absent', () => {
    const result = transformUser({ 'fibery/id': 'user-uuid-7777', 'user/name': 'Bob' })
    expect(result.email).toBeUndefined()
  })

  it('name is empty string when user/name is absent', () => {
    const result = transformUser({ 'fibery/id': 'user-uuid-7777' })
    expect(result.name).toBe('')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
