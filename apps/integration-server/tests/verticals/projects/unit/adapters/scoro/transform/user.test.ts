import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawScoroUser,
} from '../../../../../../../src/verticals/projects/adapters/scoro/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('scoro transformUser', () => {
  const raw: RawScoroUser = {
    id: 7,
    username: 'jdoe',
    email: 'jane.doe@example.com',
    full_name: 'Jane Doe',
    firstname: 'Jane',
    lastname: 'Doe',
    status: 'active',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
  })

  it('maps email from raw.email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane.doe@example.com')
  })

  it('name prefers full_name', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('name falls back to joined firstname+lastname when full_name absent', () => {
    const result = transformUser({ ...raw, full_name: undefined })
    expect(result.name).toBe('Jane Doe')
  })

  it('name falls back to username when no name fields', () => {
    const result = transformUser({ id: 7, username: 'jdoe' })
    expect(result.name).toBe('jdoe')
  })

  it('workspaceIds includes companyAccountId when provided', () => {
    const result = transformUser(raw, 'acc-1')
    expect(result.workspaceIds).toEqual(['acc-1'])
  })

  it('workspaceIds is empty when no companyAccountId', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('stores username and status in metadata', () => {
    const result = transformUser(raw)
    expect(result.metadata.username).toBe('jdoe')
    expect(result.metadata.status).toBe('active')
  })

  it('platform is scoro', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('scoro')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
