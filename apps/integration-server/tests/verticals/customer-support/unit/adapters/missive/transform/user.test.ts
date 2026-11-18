import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawMissiveUser,
} from '../../../../../../../src/verticals/customer-support/adapters/missive/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema/user'

describe('missive transformUser', () => {
  const raw: RawMissiveUser = {
    id: 'user-123',
    email: 'olivia@company.example',
    first_name: 'Olivia',
    last_name: 'Admin',
    display_name: 'Olivia Admin',
    avatar_url: 'https://example.com/avatar.png',
    me: false,
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('user-123')
    expect(result.externalId).toBe('user-123')
  })

  it('uses display_name as name when present', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Olivia Admin')
  })

  it('falls back to first_name + last_name when display_name absent', () => {
    const noDisplay: RawMissiveUser = { ...raw, display_name: undefined }
    const result = transformUser(noDisplay)
    expect(result.name).toBe('Olivia Admin')
  })

  it('maps email field', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('olivia@company.example')
  })

  it('role is undefined (Missive does not expose roles)', () => {
    const result = transformUser(raw)
    expect(result.role).toBeUndefined()
  })

  it('teamIds is an empty array', () => {
    const result = transformUser(raw)
    expect(result.teamIds).toEqual([])
  })

  it('sets platform to missive', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('missive')
  })

  it('produces a UserSchema-valid result', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('handles null email — email is undefined', () => {
    const noEmail: RawMissiveUser = { ...raw, email: null }
    const result = transformUser(noEmail)
    expect(result.email).toBeUndefined()
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
