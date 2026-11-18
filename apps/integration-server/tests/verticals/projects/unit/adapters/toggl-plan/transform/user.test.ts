import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawTogglPlanMember,
} from '../../../../../../../src/verticals/projects/adapters/toggl-plan/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('toggl-plan transformUser', () => {
  const raw: RawTogglPlanMember = {
    id: 101,
    name: 'Bob Builder',
    email: 'bob@example.com',
    role: 'member',
    active: true,
    color: '#22c55e',
    color_id: 4,
    initials: 'BB',
    hours_per_work_day: '8',
    minutes_per_work_day: 0,
    dummy: false,
    picture_url: 'https://cdn.example.com/bob.jpg',
    has_picture: true,
    activated_at: '2024-01-01T00:00:00.000Z',
    deactivated_at: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-03-01T00:00:00.000Z',
  }

  it('maps id and externalId from raw.id as string', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
  })

  it('maps name correctly', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Bob Builder')
  })

  it('maps email correctly', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('bob@example.com')
  })

  it('workspaceIds contains supplied workspaceId', () => {
    const result = transformUser(raw, 'ws-42')
    expect(result.workspaceIds).toEqual(['ws-42'])
  })

  it('workspaceIds is empty when no workspaceId arg', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is toggl-plan', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('toggl-plan')
  })

  it('metadata stores role', () => {
    const result = transformUser(raw)
    expect(result.metadata['role']).toBe('member')
  })

  it('metadata stores initials', () => {
    const result = transformUser(raw)
    expect(result.metadata['initials']).toBe('BB')
  })

  it('metadata stores dummy flag', () => {
    const result = transformUser({ ...raw, dummy: true })
    expect(result.metadata['dummy']).toBe('true')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
