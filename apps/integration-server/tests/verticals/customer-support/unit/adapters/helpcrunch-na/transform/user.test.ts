import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawInvGateAgent,
} from '../../../../../../../src/verticals/customer-support/adapters/helpcrunch-na/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema/user'

describe('helpcrunch-na transformUser', () => {
  const raw: RawInvGateAgent = {
    id: 42,
    name: 'Carlos Mendez',
    email: 'carlos.mendez@example.com',
    username: 'cmendez',
    role: 'agent',
    group_id: 8,
  }

  it('maps id to string id and externalId', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps email field', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('carlos.mendez@example.com')
  })

  it('maps name field', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Carlos Mendez')
  })

  it('maps role field', () => {
    const result = transformUser(raw)
    expect(result.role).toBe('agent')
  })

  it('maps group_id to teamIds array', () => {
    const result = transformUser(raw)
    expect(result.teamIds).toEqual(['8'])
  })

  it('sets platform to helpcrunch-na', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('helpcrunch-na')
  })

  it('stores username in metadata', () => {
    const result = transformUser(raw)
    expect(result.metadata['username']).toBe('cmendez')
  })

  it('produces a UserSchema-valid result', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('falls back to username when name is absent', () => {
    const noName: RawInvGateAgent = { id: 99, username: 'noname_agent' }
    const result = transformUser(noName)
    expect(result.name).toBe('noname_agent')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('returns empty teamIds when group_id is null', () => {
    const noGroup: RawInvGateAgent = { ...raw, group_id: null }
    const result = transformUser(noGroup)
    expect(result.teamIds).toEqual([])
  })

  it('handles minimal input', () => {
    const minimal: RawInvGateAgent = { id: 1 }
    const result = transformUser(minimal)
    expect(result.id).toBe('1')
    expect(result.name).toBe('')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
