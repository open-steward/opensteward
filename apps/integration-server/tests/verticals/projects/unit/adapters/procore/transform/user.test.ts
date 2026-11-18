import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawProcoreUser,
} from '../../../../../../../src/verticals/projects/adapters/procore/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('procore transformUser', () => {
  const raw: RawProcoreUser = {
    id: 55,
    name: 'Bob Builder',
    first_name: 'Bob',
    last_name: 'Builder',
    email_address: 'bob.builder@example.com',
    login: 'bbuilder@example.com',
    is_active: true,
    is_employee: true,
    job_title: 'Site Manager',
  }

  it('maps id and externalId to string of numeric id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('55')
    expect(result.externalId).toBe('55')
  })

  it('name prefers raw.name when present', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Bob Builder')
  })

  it('name composed from first_name + last_name when raw.name absent', () => {
    const result = transformUser({ ...raw, name: undefined })
    expect(result.name).toBe('Bob Builder')
  })

  it('name from only first_name when last_name absent', () => {
    const result = transformUser({ ...raw, name: undefined, last_name: undefined })
    expect(result.name).toBe('Bob')
  })

  it('name is empty string when all name sources absent', () => {
    const result = transformUser({ id: 1 })
    expect(result.name).toBe('')
  })

  it('email prefers email_address over login', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('bob.builder@example.com')
  })

  it('email falls back to login when email_address absent', () => {
    const result = transformUser({ ...raw, email_address: undefined })
    expect(result.email).toBe('bbuilder@example.com')
  })

  it('email is undefined when both absent', () => {
    const result = transformUser({ ...raw, email_address: undefined, login: undefined })
    expect(result.email).toBeUndefined()
  })

  it('workspaceIds includes workspaceId arg when provided', () => {
    const result = transformUser(raw, 'ws-10')
    expect(result.workspaceIds).toEqual(['ws-10'])
  })

  it('workspaceIds is empty array when no arg given', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('metadata.jobTitle from raw.job_title', () => {
    const result = transformUser(raw)
    expect(result.metadata.jobTitle).toBe('Site Manager')
  })

  it('metadata.isActive from raw.is_active', () => {
    const result = transformUser(raw)
    expect(result.metadata.isActive).toBe('true')
  })

  it('metadata.isEmployee from raw.is_employee', () => {
    const result = transformUser(raw)
    expect(result.metadata.isEmployee).toBe('true')
  })

  it('platform is procore', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('procore')
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
