import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawRocketlaneUser,
} from '../../../../../../../src/verticals/projects/adapters/rocketlane/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('rocketlane transformUser', () => {
  const raw: RawRocketlaneUser = {
    userId: 7,
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane.doe@acme.example',
    type: 'INTERNAL',
    status: 'ACTIVE',
    roleId: 3,
    capacityInMinutes: 480,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-10T00:00:00Z',
  }

  it('maps userId to id as string', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('7')
  })

  it('sets externalId equal to id', () => {
    const result = transformUser(raw)
    expect(result.externalId).toBe(result.id)
  })

  it('composes name from firstName and lastName', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('name uses only firstName when lastName is absent', () => {
    const result = transformUser({ ...raw, lastName: undefined })
    expect(result.name).toBe('Jane')
  })

  it('name uses only lastName when firstName is absent', () => {
    const result = transformUser({ ...raw, firstName: undefined })
    expect(result.name).toBe('Doe')
  })

  it('name is empty string when both first and last name are absent', () => {
    const result = transformUser({ userId: 1 })
    expect(result.name).toBe('')
  })

  it('maps email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane.doe@acme.example')
  })

  it('email is undefined when absent', () => {
    const result = transformUser({ userId: 1 })
    expect(result.email).toBeUndefined()
  })

  it('workspaceIds is always an empty array', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is rocketlane', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('rocketlane')
  })

  it('metadata contains type', () => {
    const result = transformUser(raw)
    expect(result.metadata.type).toBe('INTERNAL')
  })

  it('metadata contains status', () => {
    const result = transformUser(raw)
    expect(result.metadata.status).toBe('ACTIVE')
  })

  it('metadata contains roleId as string', () => {
    const result = transformUser(raw)
    expect(result.metadata.roleId).toBe('3')
  })

  it('metadata contains updatedAt as ISO string', () => {
    const result = transformUser(raw)
    expect(result.metadata.updatedAt).toBe('2026-01-10T00:00:00.000Z')
  })

  it('metadata contains createdAt as raw string (not ISO-converted)', () => {
    // Note: createdAt is stored as-is in strMap (not passed through toIso), so its raw
    // string value appears in metadata, while updatedAt IS passed through toIso.
    const result = transformUser(raw)
    expect(result.metadata.createdAt).toBe('2026-01-01T00:00:00Z')
  })

  it('id is empty string when userId is absent', () => {
    const result = transformUser({})
    expect(result.id).toBe('')
  })

  it('preserves the original raw payload', () => {
    const result = transformUser(raw)
    expect(result.raw).toBe(raw)
  })

  it('passes UserSchema.parse for a fully-populated user', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('passes UserSchema.parse for a minimal user (userId only)', () => {
    const result = transformUser({ userId: 42 })
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('passes UserSchema.parse for EXTERNAL user type', () => {
    const result = transformUser({ ...raw, type: 'EXTERNAL' })
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
