import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawProjectManagerUser,
} from '../../../../../../../src/verticals/projects/adapters/projectmanager/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('projectmanager transformUser', () => {
  const raw: RawProjectManagerUser = {
    id: 'res-uuid-33',
    name: 'Eve Resource',
    firstName: 'Eve',
    lastName: 'Resource',
    email: 'eve.resource@example.com',
    phone: '+1-555-9999',
    isActive: true,
    role: 'developer',
    city: 'New York',
    state: 'NY',
    country: 'US',
    createdDate: '2023-09-01T00:00:00.000Z',
    modifiedDate: '2025-04-15T12:00:00.000Z',
  }

  it('maps id and externalId', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('res-uuid-33')
    expect(result.externalId).toBe('res-uuid-33')
  })

  it('prefers name field over firstName+lastName', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Eve Resource')
  })

  it('composes name from firstName+lastName when name field is absent', () => {
    const noName: RawProjectManagerUser = { id: 'r2', firstName: 'Frank', lastName: 'Builder' }
    const result = transformUser(noName)
    expect(result.name).toBe('Frank Builder')
  })

  it('maps email correctly', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('eve.resource@example.com')
  })

  it('workspaceIds includes workspaceId when provided', () => {
    const result = transformUser(raw, 'ws-pm-99')
    expect(result.workspaceIds).toEqual(['ws-pm-99'])
  })

  it('workspaceIds is empty array when not provided', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is projectmanager', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('projectmanager')
  })

  it('metadata includes role and isActive', () => {
    const result = transformUser(raw)
    expect(result.metadata.role).toBe('developer')
    expect(result.metadata.isActive).toBe('true')
  })

  it('metadata includes city, state, country', () => {
    const result = transformUser(raw)
    expect(result.metadata.city).toBe('New York')
    expect(result.metadata.state).toBe('NY')
    expect(result.metadata.country).toBe('US')
  })

  it('metadata includes createdDate and modifiedDate as ISO strings', () => {
    const result = transformUser(raw)
    expect(result.metadata.createdDate).toBe('2023-09-01T00:00:00.000Z')
    expect(result.metadata.modifiedDate).toBe('2025-04-15T12:00:00.000Z')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
