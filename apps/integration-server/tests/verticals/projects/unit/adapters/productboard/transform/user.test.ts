import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawProductboardUser,
} from '../../../../../../../src/verticals/projects/adapters/productboard/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('productboard transformUser', () => {
  const raw: RawProductboardUser = {
    id: 'user-55',
    name: 'Jane Doe',
    email: 'jane.doe@acme.example',
    role: 'admin',
    active: true,
    externalId: 'ext-jane',
    companyId: 'co-10',
    createdAt: '2023-07-20T11:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('user-55')
    expect(result.externalId).toBe('user-55')
  })

  it('maps name correctly', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('maps email correctly', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane.doe@acme.example')
  })

  it('workspaceIds is always empty array (single-workspace token)', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is productboard', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('productboard')
  })

  it('metadata includes role and active', () => {
    const result = transformUser(raw)
    expect(result.metadata.role).toBe('admin')
    expect(result.metadata.active).toBe('true')
  })

  it('metadata includes companyId', () => {
    const result = transformUser(raw)
    expect(result.metadata.companyId).toBe('co-10')
  })

  it('email is undefined when not provided', () => {
    const result = transformUser({ id: 'u2', name: 'No Email' })
    expect(result.email).toBeUndefined()
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
