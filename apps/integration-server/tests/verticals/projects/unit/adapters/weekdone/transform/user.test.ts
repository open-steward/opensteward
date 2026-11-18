import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawWeekdoneUser,
} from '../../../../../../../src/verticals/projects/adapters/weekdone/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('weekdone transformUser', () => {
  const raw: RawWeekdoneUser = {
    id: 3,
    name: 'Jane Doe',
    email: 'jane.doe@acme.example',
    picture: 'https://cdn.weekdone.com/avatars/jane.png',
    admin: 1,
    team_id: 9,
    teams: [
      { id: 9, name: 'Engineering' },
      { id: 12, name: 'Product' },
    ],
  }

  it('id is stringified user id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('3')
  })

  it('externalId equals id', () => {
    const result = transformUser(raw)
    expect(result.externalId).toBe('3')
  })

  it('name maps from name field', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('name is empty string when absent', () => {
    const result = transformUser({ id: 1 })
    expect(result.name).toBe('')
  })

  it('email is preserved', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane.doe@acme.example')
  })

  it('email is undefined when absent', () => {
    const result = transformUser({ id: 1 })
    expect(result.email).toBeUndefined()
  })

  it('workspaceIds uses provided workspaceId arg when given', () => {
    const result = transformUser(raw, 'ws-explicit')
    expect(result.workspaceIds).toEqual(['ws-explicit'])
  })

  it('workspaceIds is derived from teams array when no arg given', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual(['9', '12'])
  })

  it('workspaceIds falls back to team_id when teams is empty and no arg given', () => {
    const result = transformUser({ ...raw, teams: [] })
    expect(result.workspaceIds).toEqual(['9'])
  })

  it('workspaceIds is empty array when all team sources are absent', () => {
    const result = transformUser({ id: 1 })
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is weekdone', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('weekdone')
  })

  it('metadata contains admin and pictureUrl', () => {
    const result = transformUser(raw)
    expect(result.metadata.admin).toBe('1')
    expect(result.metadata.pictureUrl).toBe('https://cdn.weekdone.com/avatars/jane.png')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('passes UserSchema.parse with minimal input', () => {
    const result = transformUser({ id: 1 })
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
