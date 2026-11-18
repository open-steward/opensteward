import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawSysaidAgent,
} from '../../../../../../../src/verticals/customer-support/adapters/sysaid/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema/user'

describe('sysaid transformUser', () => {
  it('maps a fully-populated agent with group memberships', () => {
    const raw: RawSysaidAgent = {
      id: 55,
      userEmail: 'agent@example.com',
      userName: 'agent1',
      firstName: 'Agent',
      lastName: 'One',
      displayName: 'Agent One',
      workPhone: '+14155550100',
      supervisorLevel: 0,
      isDisabled: false,
      groups: [
        { id: 10, name: 'IT Support' },
        { id: 20, name: 'Network Ops' },
      ],
    }

    const result = transformUser(raw)

    // id maps from raw.id
    expect(result.id).toBe('55')
    expect(result.externalId).toBe('55')
    // email maps from userEmail
    expect(result.email).toBe('agent@example.com')
    // name maps from displayName
    expect(result.name).toBe('Agent One')
    // supervisorLevel=0 (falsy) → role='agent'
    expect(result.role).toBe('agent')
    // teamIds from groups[].id
    expect(result.teamIds).toEqual(['10', '20'])
    // platform
    expect(result.platform).toBe('sysaid')

    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('maps a supervisor agent — role=supervisor when supervisorLevel is set', () => {
    const raw: RawSysaidAgent = {
      id: 66,
      userEmail: 'supervisor@example.com',
      displayName: 'Super Visor',
      supervisorLevel: 1,
      groups: [],
    }

    const result = transformUser(raw)

    expect(result.role).toBe('supervisor')
    expect(result.teamIds).toEqual([])

    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('falls back to joined first+last name when displayName absent', () => {
    const raw: RawSysaidAgent = {
      id: 77,
      userEmail: 'tech@example.com',
      firstName: 'Tech',
      lastName: 'User',
    }

    const result = transformUser(raw)

    // name built from firstName + lastName
    expect(result.name).toBe('Tech User')

    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('falls back to userName when all name parts absent', () => {
    const raw: RawSysaidAgent = {
      id: 88,
      userEmail: 'u@example.com',
      userName: 'techuser88',
    }

    const result = transformUser(raw)

    expect(result.name).toBe('techuser88')

    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('filters out groups with undefined id from teamIds', () => {
    const raw: RawSysaidAgent = {
      id: 99,
      displayName: 'Partial Agent',
      groups: [{ id: 5, name: 'Ops' }, { name: 'NoId' }],
    }

    const result = transformUser(raw)

    // Only group with id is included
    expect(result.teamIds).toEqual(['5'])

    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
