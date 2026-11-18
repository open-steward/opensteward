import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawClarizenUser,
} from '../../../../../../../src/verticals/projects/adapters/planview-adaptivework/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('planview-adaptivework transformUser', () => {
  const raw: RawClarizenUser = {
    id: '/User/usr-7',
    FirstName: 'Jane',
    LastName: 'Doe',
    Email: 'jane.doe@example.com',
    UserName: 'jdoe',
    State: 'Active',
    CreatedOn: '2025-10-01T00:00:00.000Z',
    LastUpdatedOn: '2026-01-15T00:00:00.000Z',
  }

  it('maps id and externalId directly from raw.id URI', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('/User/usr-7')
    expect(result.externalId).toBe('/User/usr-7')
  })

  it('assembles name from FirstName + LastName', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('name from only FirstName when LastName absent', () => {
    const result = transformUser({ ...raw, LastName: undefined })
    expect(result.name).toBe('Jane')
  })

  it('name falls back to UserName when both name parts absent', () => {
    const result = transformUser({ ...raw, FirstName: undefined, LastName: undefined })
    expect(result.name).toBe('jdoe')
  })

  it('name falls back to Email when FirstName/LastName/UserName all absent', () => {
    const result = transformUser({
      ...raw,
      FirstName: undefined,
      LastName: undefined,
      UserName: undefined,
    })
    expect(result.name).toBe('jane.doe@example.com')
  })

  it('name is empty string when all name sources absent', () => {
    const result = transformUser({ id: '/User/x' })
    expect(result.name).toBe('')
  })

  it('email from raw.Email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane.doe@example.com')
  })

  it('email is undefined when Email absent', () => {
    const result = transformUser({ ...raw, Email: undefined })
    expect(result.email).toBeUndefined()
  })

  it('workspaceIds includes workspaceId arg when provided', () => {
    const result = transformUser(raw, 'ws-org-1')
    expect(result.workspaceIds).toEqual(['ws-org-1'])
  })

  it('workspaceIds is empty array when no arg given', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('metadata.userName from UserName', () => {
    const result = transformUser(raw)
    expect(result.metadata.userName).toBe('jdoe')
  })

  it('metadata.state from State string', () => {
    const result = transformUser(raw)
    expect(result.metadata.state).toBe('Active')
  })

  it('platform is planview-adaptivework', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('planview-adaptivework')
  })

  it('raw is preserved on output', () => {
    const result = transformUser(raw)
    expect(result.raw).toBe(raw)
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
