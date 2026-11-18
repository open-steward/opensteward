import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawYandexTrackerUser,
} from '../../../../../../../src/verticals/projects/adapters/yandex-tracker/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('yandex-tracker transformUser', () => {
  const raw: RawYandexTrackerUser = {
    uid: 12345,
    login: 'alice',
    cloudUid: 'cloud-uid-abc',
    firstName: 'Alice',
    lastName: 'Smith',
    display: 'Alice Smith',
    email: 'alice@example.com',
    external: false,
    hasLicense: true,
    dismissed: false,
  }

  it('prefers cloudUid as id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('cloud-uid-abc')
    expect(result.externalId).toBe('cloud-uid-abc')
  })

  it('falls back to string of uid when cloudUid absent', () => {
    const result = transformUser({ ...raw, cloudUid: undefined })
    expect(result.id).toBe('12345')
  })

  it('falls back to login when both cloudUid and uid absent', () => {
    const result = transformUser({ ...raw, cloudUid: undefined, uid: undefined })
    expect(result.id).toBe('alice')
  })

  it('id is empty string when all identity fields absent', () => {
    const result = transformUser({})
    expect(result.id).toBe('')
  })

  it('prefers display as name', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Alice Smith')
  })

  it('composes name from firstName + lastName when display absent', () => {
    const result = transformUser({ ...raw, display: undefined })
    expect(result.name).toBe('Alice Smith')
  })

  it('falls back to login when name fields absent', () => {
    const result = transformUser({
      ...raw,
      display: undefined,
      firstName: undefined,
      lastName: undefined,
    })
    expect(result.name).toBe('alice')
  })

  it('name is empty string when all name fields absent', () => {
    const result = transformUser({})
    expect(result.name).toBe('')
  })

  it('maps email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('alice@example.com')
  })

  it('maps workspaceIds when workspaceId provided', () => {
    const result = transformUser(raw, 'ws-1')
    expect(result.workspaceIds).toEqual(['ws-1'])
  })

  it('workspaceIds is empty when workspaceId not provided', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is yandex-tracker', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('yandex-tracker')
  })

  it('metadata includes login, dismissed, hasLicense', () => {
    const result = transformUser(raw)
    expect(result.metadata.login).toBe('alice')
    expect(result.metadata.dismissed).toBe('false')
    expect(result.metadata.hasLicense).toBe('true')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw, 'ws-1')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
