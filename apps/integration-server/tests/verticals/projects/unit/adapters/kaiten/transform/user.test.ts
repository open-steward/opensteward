import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawKaitenUser,
} from '../../../../../../../src/verticals/projects/adapters/kaiten/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('kaiten transformUser', () => {
  const raw: RawKaitenUser = {
    id: 10,
    full_name: 'Alice Smith',
    email: 'alice@example.com',
    username: 'asmith',
    initials: 'AS',
    activated: true,
    company_id: 5,
    role: 2,
    created: '2023-01-01T00:00:00.000Z',
    updated: '2024-01-01T00:00:00.000Z',
    timezone: 'Europe/Stockholm',
  }

  it('maps id as string', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('10')
    expect(result.externalId).toBe('10')
  })

  it('maps full_name to name', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Alice Smith')
  })

  it('maps email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('alice@example.com')
  })

  it('falls back to username when full_name absent', () => {
    const result = transformUser({ ...raw, full_name: undefined })
    expect(result.name).toBe('asmith')
  })

  it('workspaceIds is always empty (company-scoped users)', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is kaiten', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('kaiten')
  })

  it('metadata contains username, initials, role, timezone', () => {
    const result = transformUser(raw)
    expect(result.metadata.username).toBe('asmith')
    expect(result.metadata.initials).toBe('AS')
    expect(result.metadata.role).toBe('2')
    expect(result.metadata.timezone).toBe('Europe/Stockholm')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
