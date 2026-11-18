import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawMeUser,
} from '../../../../../../../src/verticals/projects/adapters/microsoft-todo/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('microsoft-todo transformUser', () => {
  const raw: RawMeUser = {
    id: 'user-guid-abc',
    displayName: 'Jane Doe',
    userPrincipalName: 'jane.doe@example.com',
    mail: 'jane.doe@example.com',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('user-guid-abc')
    expect(result.externalId).toBe('user-guid-abc')
  })

  it('maps name from displayName', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('falls back name to userPrincipalName when displayName is absent', () => {
    const result = transformUser({ id: 'u-2', userPrincipalName: 'jsmith@example.com' })
    expect(result.name).toBe('jsmith@example.com')
  })

  it('maps email from mail field', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane.doe@example.com')
  })

  it('falls back email to userPrincipalName when mail is absent', () => {
    const result = transformUser({ id: 'u-3', userPrincipalName: 'jsmith@example.com' })
    expect(result.email).toBe('jsmith@example.com')
  })

  it('workspaceIds contains the user id (self-parented)', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual(['user-guid-abc'])
  })

  it('platform is microsoft-todo', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('microsoft-todo')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
