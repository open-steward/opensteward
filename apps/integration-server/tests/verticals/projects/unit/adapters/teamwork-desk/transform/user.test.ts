import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawSpacesUser,
} from '../../../../../../../src/verticals/projects/adapters/teamwork-desk/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('teamwork-desk transformUser', () => {
  const raw: RawSpacesUser = {
    id: 77,
    // Note: lowercase 'firstname'/'lastname' — Spaces API quirk
    firstname: 'Alice',
    lastname: 'Smith',
    email: 'alice.smith@example.com',
    avatar: 'https://cdn.example.com/avatars/77.jpg',
    state: 'active',
    userType: 'collaborator',
    isAdmin: false,
    isOnboarded: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-03-01T00:00:00.000Z',
  }

  it('maps id and externalId from raw.id as string', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('77')
    expect(result.externalId).toBe('77')
  })

  it('builds full name from firstname + lastname (lowercase field names)', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Alice Smith')
  })

  it('falls back to email when both name parts are absent', () => {
    const result = transformUser({ id: 1, email: 'ghost@example.com' })
    expect(result.name).toBe('ghost@example.com')
  })

  it('maps email correctly', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('alice.smith@example.com')
  })

  it('workspaceIds is always empty (installation-scoped)', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is teamwork-desk', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('teamwork-desk')
  })

  it('metadata stores state', () => {
    const result = transformUser(raw)
    expect(result.metadata['state']).toBe('active')
  })

  it('metadata stores userType', () => {
    const result = transformUser(raw)
    expect(result.metadata['userType']).toBe('collaborator')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
