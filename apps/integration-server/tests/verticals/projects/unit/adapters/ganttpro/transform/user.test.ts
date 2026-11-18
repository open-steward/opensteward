import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawGanttproUser,
} from '../../../../../../../src/verticals/projects/adapters/ganttpro/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

const rawUser: RawGanttproUser = {
  id: 99,
  teamId: 7,
  email: 'jane.doe@acme.example',
  firstName: 'Jane',
  lastName: 'Doe',
  username: 'janedoe',
  photo: 'https://cdn.example.com/photo.png',
  locale: 'en-US',
}

describe('transformUser', () => {
  it('maps id to id as a string', () => {
    const result = transformUser(rawUser)
    expect(result.id).toBe('99')
    expect(result.externalId).toBe('99')
  })

  it('joins firstName and lastName into name', () => {
    const result = transformUser(rawUser)
    expect(result.name).toBe('Jane Doe')
  })

  it('falls back to username when both firstName and lastName are absent', () => {
    const result = transformUser({ id: 1, username: 'ghostuser' })
    expect(result.name).toBe('ghostuser')
  })

  it('uses only firstName when lastName is absent', () => {
    const result = transformUser({ id: 1, firstName: 'Solo' })
    expect(result.name).toBe('Solo')
  })

  it('maps email directly', () => {
    const result = transformUser(rawUser)
    expect(result.email).toBe('jane.doe@acme.example')
  })

  it('maps teamId to workspaceIds as string array', () => {
    const result = transformUser(rawUser)
    expect(result.workspaceIds).toEqual(['7'])
  })

  it('returns empty workspaceIds when teamId is absent', () => {
    const result = transformUser({ id: 2, firstName: 'No', lastName: 'Team' })
    expect(result.workspaceIds).toEqual([])
  })

  it('sets platform to "ganttpro"', () => {
    const result = transformUser(rawUser)
    expect(result.platform).toBe('ganttpro')
  })

  it('passes schema validation', () => {
    const result = transformUser(rawUser)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('handles numeric string id', () => {
    const result = transformUser({ ...rawUser, id: '42' })
    expect(result.id).toBe('42')
  })
})
