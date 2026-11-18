import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawPingcodeUser,
} from '../../../../../../../src/verticals/projects/adapters/pingcode/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('transformUser', () => {
  it('maps all fields from a fully populated pingcode user', () => {
    const raw: RawPingcodeUser = {
      id: 'usr_001',
      name: 'alice.smith',
      display_name: 'Alice Smith',
      email: 'alice.smith@acme.example',
      is_disabled: false,
      avatar: 'https://cdn.pingcode.com/avatars/usr_001.png',
    }

    const result = transformUser(raw)

    expect(result.id).toBe('usr_001')
    expect(result.externalId).toBe('usr_001')
    expect(result.name).toBe('Alice Smith')
    expect(result.email).toBe('alice.smith@acme.example')
    expect(result.workspaceIds).toEqual([])
    expect(result.platform).toBe('pingcode')
    expect(result.metadata.loginName).toBe('alice.smith')
    expect(result.metadata.isDisabled).toBe('false')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('prefers display_name over name for the canonical name field', () => {
    const raw: RawPingcodeUser = {
      id: 'usr_002',
      name: 'bob.jones',
      display_name: 'Bob Jones',
    }

    const result = transformUser(raw)

    expect(result.name).toBe('Bob Jones')
    expect(result.metadata.loginName).toBe('bob.jones')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('falls back to name when display_name is absent', () => {
    const raw: RawPingcodeUser = {
      id: 'usr_003',
      name: 'charlie.dev',
    }

    const result = transformUser(raw)

    expect(result.name).toBe('charlie.dev')
    expect(result.metadata.loginName).toBe('charlie.dev')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('defaults name to empty string when both name and display_name are absent', () => {
    const raw: RawPingcodeUser = {
      id: 'usr_004',
    }

    const result = transformUser(raw)

    expect(result.name).toBe('')
    expect(result.email).toBeUndefined()
    expect(result.metadata.loginName).toBeUndefined()
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('stores isDisabled as string in metadata', () => {
    const raw: RawPingcodeUser = {
      id: 'usr_005',
      display_name: 'Disabled User',
      is_disabled: true,
    }

    const result = transformUser(raw)

    expect(result.metadata.isDisabled).toBe('true')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('always returns empty workspaceIds array', () => {
    const raw: RawPingcodeUser = {
      id: 'usr_006',
      display_name: 'Eve',
    }

    const result = transformUser(raw)

    expect(result.workspaceIds).toEqual([])
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
