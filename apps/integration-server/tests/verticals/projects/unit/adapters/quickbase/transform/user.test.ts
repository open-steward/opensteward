import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawQuickbaseUser,
} from '../../../../../../../src/verticals/projects/adapters/quickbase/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('quickbase transformUser', () => {
  const raw: RawQuickbaseUser = {
    id: 'usr_alice',
    name: 'Alice Smith',
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    screenName: 'asmith',
  }

  it('maps id from raw.id', () => {
    const result = transformUser(raw, 'app_acme')
    expect(result.id).toBe('usr_alice')
  })

  it('externalId equals id', () => {
    const result = transformUser(raw, 'app_acme')
    expect(result.externalId).toBe('usr_alice')
  })

  it('name field wins over firstName+lastName when both present', () => {
    const result = transformUser(raw, 'app_acme')
    expect(result.name).toBe('Alice Smith')
  })

  it('falls back to firstName+lastName combined when name is absent', () => {
    const rawNoName: RawQuickbaseUser = {
      id: 'usr_bob',
      firstName: 'Bob',
      lastName: 'Jones',
      email: 'bob@example.com',
    }
    const result = transformUser(rawNoName, 'app_acme')
    expect(result.name).toBe('Bob Jones')
  })

  it('falls back to firstName only when lastName is absent', () => {
    const rawFirstOnly: RawQuickbaseUser = {
      id: 'usr_carol',
      firstName: 'Carol',
      email: 'carol@example.com',
    }
    const result = transformUser(rawFirstOnly, 'app_acme')
    expect(result.name).toBe('Carol')
  })

  it('falls back to screenName when name and firstName+lastName are absent', () => {
    const rawScreenOnly: RawQuickbaseUser = {
      id: 'usr_dave',
      screenName: 'daveq',
    }
    const result = transformUser(rawScreenOnly, 'app_acme')
    expect(result.name).toBe('daveq')
  })

  it('name is empty string when all name fields are absent', () => {
    const result = transformUser({ id: 'usr_ghost' })
    expect(result.name).toBe('')
  })

  it('maps email from raw.email', () => {
    const result = transformUser(raw, 'app_acme')
    expect(result.email).toBe('alice@example.com')
  })

  it('workspaceIds contains the appId argument when provided', () => {
    const result = transformUser(raw, 'app_acme')
    expect(result.workspaceIds).toContain('app_acme')
  })

  it('workspaceIds is empty array when appId is omitted', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is quickbase', () => {
    const result = transformUser(raw, 'app_acme')
    expect(result.platform).toBe('quickbase')
  })

  it('metadata includes screenName', () => {
    const result = transformUser(raw, 'app_acme')
    expect(result.metadata.screenName).toBe('asmith')
  })

  it('metadata includes firstName', () => {
    const result = transformUser(raw, 'app_acme')
    expect(result.metadata.firstName).toBe('Alice')
  })

  it('metadata includes lastName', () => {
    const result = transformUser(raw, 'app_acme')
    expect(result.metadata.lastName).toBe('Smith')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw, 'app_acme')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
