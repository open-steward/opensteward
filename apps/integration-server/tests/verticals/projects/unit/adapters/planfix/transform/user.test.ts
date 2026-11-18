import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawPlanfixUser,
} from '../../../../../../../src/verticals/projects/adapters/planfix/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('planfix transformUser', () => {
  const raw: RawPlanfixUser = {
    id: 7,
    name: 'Jane',
    midname: 'Marie',
    lastname: 'Doe',
    email: 'jane.doe@example.com',
    login: 'jdoe',
    status: 'active',
    role: 'manager',
    groups: [{ id: 1, name: 'Dev Team' }],
  }

  it('maps id and externalId to string of numeric id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
  })

  it('assembles full name from name + midname + lastname', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Marie Doe')
  })

  it('assembles name without midname when midname absent', () => {
    const result = transformUser({ ...raw, midname: undefined })
    expect(result.name).toBe('Jane Doe')
  })

  it('assembles name from only lastname when name absent', () => {
    const result = transformUser({ ...raw, name: undefined, midname: undefined })
    expect(result.name).toBe('Doe')
  })

  it('name is empty string when all name parts absent', () => {
    const result = transformUser({ id: 1 })
    expect(result.name).toBe('')
  })

  it('email from raw.email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane.doe@example.com')
  })

  it('email is undefined when raw.email absent', () => {
    const result = transformUser({ ...raw, email: undefined })
    expect(result.email).toBeUndefined()
  })

  it('workspaceIds is empty array (single-account platform)', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('metadata.login from raw.login', () => {
    const result = transformUser(raw)
    expect(result.metadata.login).toBe('jdoe')
  })

  it('metadata.status from raw.status', () => {
    const result = transformUser(raw)
    expect(result.metadata.status).toBe('active')
  })

  it('metadata.role from raw.role', () => {
    const result = transformUser(raw)
    expect(result.metadata.role).toBe('manager')
  })

  it('platform is planfix', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('planfix')
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
