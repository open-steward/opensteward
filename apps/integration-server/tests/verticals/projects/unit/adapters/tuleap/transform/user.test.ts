import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawTuleapUser,
} from '../../../../../../../src/verticals/projects/adapters/tuleap/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('tuleap transformUser', () => {
  const raw: RawTuleapUser = {
    id: 42,
    uri: 'users/42',
    display_name: 'Jane Developer',
    username: 'jdev',
    email: 'jdev@example.com',
    is_anonymous: false,
    avatar_url: 'https://tuleap.example.com/avatars/jdev.png',
  }

  it('maps id and externalId from raw.id as string', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps name from display_name', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Developer')
  })

  it('falls back to username when display_name is absent', () => {
    const result = transformUser({ ...raw, display_name: undefined })
    expect(result.name).toBe('jdev')
  })

  it('maps email correctly', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jdev@example.com')
  })

  it('workspaceIds contains supplied workspaceId', () => {
    const result = transformUser(raw, 'ws-110')
    expect(result.workspaceIds).toEqual(['ws-110'])
  })

  it('workspaceIds is empty when no workspaceId arg', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is tuleap', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('tuleap')
  })

  it('metadata stores username', () => {
    const result = transformUser(raw)
    expect(result.metadata['username']).toBe('jdev')
  })

  it('metadata stores isAnonymous flag as string', () => {
    const result = transformUser(raw)
    expect(result.metadata['isAnonymous']).toBe('false')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
