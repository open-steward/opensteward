import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawWeeekMember,
} from '../../../../../../../src/verticals/projects/adapters/weeek/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('weeek transformUser', () => {
  const raw: RawWeeekMember = {
    id: 'usr_jane',
    email: 'jane.doe@acme.example',
    firstName: 'Jane',
    middleName: null,
    lastName: 'Doe',
    logo: 'https://cdn.example.com/avatar.png',
    position: 'Engineer',
    timeZone: 'America/New_York',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('usr_jane')
    expect(result.externalId).toBe('usr_jane')
  })

  it('maps email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane.doe@acme.example')
  })

  it('name is concatenated firstName + lastName when middleName is null', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('name includes middleName when present', () => {
    const result = transformUser({ ...raw, middleName: 'Marie' })
    expect(result.name).toBe('Jane Marie Doe')
  })

  it('name falls back to id when no name fields are present', () => {
    const result = transformUser({ id: 'usr_anon' })
    expect(result.name).toBe('usr_anon')
  })

  it('workspaceIds contains the supplied workspaceId', () => {
    const result = transformUser(raw, 'ws_acme')
    expect(result.workspaceIds).toEqual(['ws_acme'])
  })

  it('workspaceIds is empty when workspaceId not supplied', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is weeek', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('weeek')
  })

  it('metadata.logo reflects raw.logo', () => {
    const result = transformUser(raw)
    expect(result.metadata.logo).toBe('https://cdn.example.com/avatar.png')
  })

  it('metadata.position reflects raw.position', () => {
    const result = transformUser(raw)
    expect(result.metadata.position).toBe('Engineer')
  })

  it('metadata.timeZone reflects raw.timeZone', () => {
    const result = transformUser(raw)
    expect(result.metadata.timeZone).toBe('America/New_York')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw, 'ws_acme')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
