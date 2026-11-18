import { describe, it, expect } from 'vitest'
import {
  transformTeam,
  type RawSysaidGroup,
} from '../../../../../../../src/verticals/customer-support/adapters/sysaid/transform/team'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema/team'

describe('sysaid transformTeam', () => {
  it('maps a fully-populated group to a canonical team', () => {
    const raw: RawSysaidGroup = {
      id: 10,
      name: 'IT Support',
      type: 'general',
      email: 'itsupport@example.com',
      companyId: 1,
      supportLevel: 2,
      canBeAssignedToServiceRecord: true,
    }

    const result = transformTeam(raw)

    // id maps from raw.id
    expect(result.id).toBe('10')
    expect(result.externalId).toBe('10')
    // name maps directly
    expect(result.name).toBe('IT Support')
    // platform
    expect(result.platform).toBe('sysaid')
    // type in metadata
    expect(result.metadata['type']).toBe('general')
    // email in metadata
    expect(result.metadata['email']).toBe('itsupport@example.com')

    expect(() => TeamSchema.parse(result)).not.toThrow()
  })

  it('maps a group with string id', () => {
    const raw: RawSysaidGroup = {
      id: 'grp-99',
      name: 'Network Ops',
    }

    const result = transformTeam(raw)

    expect(result.id).toBe('grp-99')
    expect(result.name).toBe('Network Ops')

    expect(() => TeamSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields gracefully', () => {
    const raw: RawSysaidGroup = {
      id: 20,
    }

    const result = transformTeam(raw)

    expect(result.id).toBe('20')
    expect(result.name).toBe('')

    expect(() => TeamSchema.parse(result)).not.toThrow()
  })

  it('produces empty id and name when all fields absent', () => {
    const raw: RawSysaidGroup = {}

    const result = transformTeam(raw)

    expect(result.id).toBe('')
    expect(result.name).toBe('')

    expect(() => TeamSchema.parse(result)).not.toThrow()
  })
})
