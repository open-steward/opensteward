import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawVivantioUser,
} from '../../../../../../../src/verticals/customer-support/adapters/vivantio/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema/user'

describe('vivantio transformUser', () => {
  it('maps a fully-populated admin user with FullName', () => {
    const raw: RawVivantioUser = {
      Id: 55,
      FullName: 'Jane Admin',
      FirstName: 'Jane',
      LastName: 'Admin',
      EmailAddress: 'jane@example.com',
      IsAdmin: true,
      Enabled: true,
      JobTitle: 'IT Manager',
      Phone1: '+14155550100',
      DomainLoginName: 'CORP\\jadmin',
    }

    const result = transformUser(raw)

    // id maps from Id
    expect(result.id).toBe('55')
    expect(result.externalId).toBe('55')
    // email maps from EmailAddress
    expect(result.email).toBe('jane@example.com')
    // name maps from FullName
    expect(result.name).toBe('Jane Admin')
    // IsAdmin=true → role='admin'
    expect(result.role).toBe('admin')
    // teamIds always empty for Vivantio user transform
    expect(result.teamIds).toEqual([])
    // platform
    expect(result.platform).toBe('vivantio')

    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('assigns role=agent when IsAdmin is false or absent', () => {
    const raw: RawVivantioUser = {
      Id: 66,
      FullName: 'Regular Agent',
      EmailAddress: 'agent@example.com',
      IsAdmin: false,
    }

    const result = transformUser(raw)

    expect(result.role).toBe('agent')

    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('falls back to joined first+last when FullName absent', () => {
    const raw: RawVivantioUser = {
      Id: 77,
      FirstName: 'Bob',
      LastName: 'Support',
      EmailAddress: 'bob@example.com',
    }

    const result = transformUser(raw)

    // name built from FirstName + LastName
    expect(result.name).toBe('Bob Support')

    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('handles null EmailAddress gracefully', () => {
    const raw: RawVivantioUser = {
      Id: 88,
      FullName: 'No Email',
      EmailAddress: null,
    }

    const result = transformUser(raw)

    expect(result.email).toBeUndefined()

    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('handles fully absent optional fields', () => {
    const raw: RawVivantioUser = {
      Id: 99,
    }

    const result = transformUser(raw)

    expect(result.id).toBe('99')
    expect(result.name).toBe('')
    expect(result.role).toBe('agent')
    expect(result.teamIds).toEqual([])

    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
