import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawProductplanUser,
} from '../../../../../../../src/verticals/projects/adapters/productplan/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('productplan transformUser', () => {
  const raw: RawProductplanUser = {
    id: 99,
    name: 'Bob Smith',
    email: 'bob.smith@example.com',
    phone_number: '+1-555-0100',
    status: 'active',
    ref_source: 'google',
    created_at: '2024-03-10T08:00:00.000Z',
  }

  it('maps id as string', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('99')
    expect(result.externalId).toBe('99')
  })

  it('maps name correctly', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Bob Smith')
  })

  it('maps email correctly', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('bob.smith@example.com')
  })

  it('workspaceIds is always empty array', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is productplan', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('productplan')
  })

  it('metadata includes status and refSource', () => {
    const result = transformUser(raw)
    expect(result.metadata.status).toBe('active')
    expect(result.metadata.refSource).toBe('google')
  })

  it('metadata includes phoneNumber', () => {
    const result = transformUser(raw)
    expect(result.metadata.phoneNumber).toBe('+1-555-0100')
  })

  it('email is undefined when not provided', () => {
    const result = transformUser({ id: 10, name: 'No Email' })
    expect(result.email).toBeUndefined()
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
