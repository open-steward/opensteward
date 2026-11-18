import { describe, it, expect } from 'vitest'
import {
  transformTeam,
  type RawVivantioGroup,
} from '../../../../../../../src/verticals/customer-support/adapters/vivantio/transform/team'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema/team'

describe('vivantio transformTeam', () => {
  it('maps a group with all fields present', () => {
    const raw: RawVivantioGroup = {
      Id: 10,
      Name: 'IT Support',
      Email: 'itsupport@example.com',
    }

    const result = transformTeam(raw)

    // id maps from Id (number → string)
    expect(result.id).toBe('10')
    expect(result.externalId).toBe('10')
    // name maps from Name
    expect(result.name).toBe('IT Support')
    // email stored in metadata
    expect(result.metadata['email']).toBe('itsupport@example.com')
    // platform
    expect(result.platform).toBe('vivantio')

    expect(() => TeamSchema.parse(result)).not.toThrow()
  })

  it('handles null Name and Email gracefully', () => {
    const raw: RawVivantioGroup = {
      Id: 20,
      Name: null,
      Email: null,
    }

    const result = transformTeam(raw)

    expect(result.id).toBe('20')
    // pickStr(null) → undefined, fallback to empty string
    expect(result.name).toBe('')
    // null email not in metadata (strMap skips null)
    expect(result.metadata['email']).toBeUndefined()

    expect(() => TeamSchema.parse(result)).not.toThrow()
  })

  it('maps a group without email', () => {
    const raw: RawVivantioGroup = {
      Id: 30,
      Name: 'Network Ops',
    }

    const result = transformTeam(raw)

    expect(result.name).toBe('Network Ops')
    expect(result.metadata['email']).toBeUndefined()

    expect(() => TeamSchema.parse(result)).not.toThrow()
  })
})
