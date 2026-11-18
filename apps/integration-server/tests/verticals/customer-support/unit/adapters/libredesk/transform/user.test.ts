import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawLibredeskAgent,
} from '../../../../../../../src/verticals/customer-support/adapters/libredesk/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema/user'

describe('libredesk transformUser', () => {
  it('concatenates first_name and last_name', () => {
    const raw: RawLibredeskAgent = { id: 1, first_name: 'Jane', last_name: 'Doe' }
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('uses only first_name when last_name is absent', () => {
    const raw: RawLibredeskAgent = { id: 2, first_name: 'Alice' }
    const result = transformUser(raw)
    expect(result.name).toBe('Alice')
  })

  it('prefers external_user_id as externalId', () => {
    const raw: RawLibredeskAgent = { id: 3, external_user_id: 'ext-agent-1', first_name: 'Bob' }
    const result = transformUser(raw)
    expect(result.externalId).toBe('ext-agent-1')
    expect(result.id).toBe('3')
  })

  it('maps email from raw.email', () => {
    const raw: RawLibredeskAgent = { id: 4, first_name: 'Agent', email: 'agent@libredesk.io' }
    const result = transformUser(raw)
    expect(result.email).toBe('agent@libredesk.io')
  })

  it('maps first entry of roles array to role', () => {
    const raw: RawLibredeskAgent = { id: 5, first_name: 'Admin', roles: ['administrator', 'agent'] }
    const result = transformUser(raw)
    expect(result.role).toBe('administrator')
  })

  it('sets role to undefined when roles is empty', () => {
    const raw: RawLibredeskAgent = { id: 6, first_name: 'No Role', roles: [] }
    const result = transformUser(raw)
    expect(result.role).toBeUndefined()
  })

  it('maps teams array to teamIds', () => {
    const raw: RawLibredeskAgent = {
      id: 7,
      first_name: 'Multi',
      teams: [
        { id: 10, name: 'Support' },
        { id: 20, name: 'Dev' },
      ],
    }
    const result = transformUser(raw)
    expect(result.teamIds).toEqual(['10', '20'])
  })

  it('sets platform to libredesk', () => {
    const raw: RawLibredeskAgent = { id: 8, first_name: 'User' }
    const result = transformUser(raw)
    expect(result.platform).toBe('libredesk')
  })

  it('passes UserSchema validation', () => {
    const raw: RawLibredeskAgent = {
      id: 99,
      external_user_id: 'ext-99',
      first_name: 'Valid',
      last_name: 'Agent',
      email: 'valid@example.com',
      roles: ['agent'],
      teams: [{ id: 1, name: 'Support' }],
    }
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
