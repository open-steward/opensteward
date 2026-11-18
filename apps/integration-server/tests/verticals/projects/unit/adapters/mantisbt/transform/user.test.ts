import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawMantisbtUser,
} from '../../../../../../../src/verticals/projects/adapters/mantisbt/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('mantisbt transformUser', () => {
  const raw: RawMantisbtUser = {
    id: 8,
    name: 'jdoe',
    real_name: 'Jane Doe',
    email: 'jane.doe@example.com',
    access_level: { id: 90, name: 'administrator', label: 'Administrator' },
    language: 'en',
    timezone: 'UTC',
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('8')
    expect(result.externalId).toBe('8')
  })

  it('maps name from real_name when present', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('falls back to name when real_name is absent', () => {
    const result = transformUser({ id: 9, name: 'jsmith' })
    expect(result.name).toBe('jsmith')
  })

  it('maps email from email field', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane.doe@example.com')
  })

  it('workspaceIds is always empty (no workspace concept)', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is mantisbt', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('mantisbt')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformUser({ id: 1 })
    expect(result.id).toBe('1')
    expect(result.name).toBe('')
    expect(result.email).toBeUndefined()
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
