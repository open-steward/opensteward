import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawProprofsStaff,
} from '../../../../../../../src/verticals/customer-support/adapters/proprofs-help-desk/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema/user'

describe('proprofs-help-desk transformUser', () => {
  it('maps a fully-populated staff member', () => {
    const raw: RawProprofsStaff = {
      id: 'ST001-001',
      name: 'Jane Agent',
      email: 'jane@example.com',
    }

    const result = transformUser(raw)

    // id maps from raw.id
    expect(result.id).toBe('ST001-001')
    expect(result.externalId).toBe('ST001-001')
    // email maps directly
    expect(result.email).toBe('jane@example.com')
    // name maps directly
    expect(result.name).toBe('Jane Agent')
    // teamIds always empty — inbox assoc is on tickets
    expect(result.teamIds).toEqual([])
    // platform
    expect(result.platform).toBe('proprofs-help-desk')

    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('maps a numeric staff id to string', () => {
    const raw: RawProprofsStaff = {
      id: 99,
      name: 'Bob Support',
      email: 'bob@example.com',
    }

    const result = transformUser(raw)

    expect(result.id).toBe('99')
    expect(result.name).toBe('Bob Support')
    // email is valid per schema
    expect(result.email).toBe('bob@example.com')

    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional email gracefully', () => {
    const raw: RawProprofsStaff = {
      id: 'ST002-002',
      name: 'No Email Agent',
    }

    const result = transformUser(raw)

    expect(result.email).toBeUndefined()
    expect(result.teamIds).toEqual([])

    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('produces empty id and name when all fields absent', () => {
    const raw: RawProprofsStaff = {}

    const result = transformUser(raw)

    expect(result.id).toBe('')
    expect(result.name).toBe('')
    expect(result.teamIds).toEqual([])

    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
