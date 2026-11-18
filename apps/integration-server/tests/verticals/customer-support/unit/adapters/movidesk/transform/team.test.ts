import { describe, it, expect } from 'vitest'
import {
  transformTeam,
  type RawMovideskTeam,
} from '../../../../../../../src/verticals/customer-support/adapters/movidesk/transform/team'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema/team'

describe('movidesk transformTeam', () => {
  const raw: RawMovideskTeam = {
    id: 12,
    name: 'Level 2 Support',
    description: 'Second-tier escalation team',
  }

  it('maps id from raw.id as string', () => {
    const result = transformTeam(raw)
    expect(result.id).toBe('12')
    expect(result.externalId).toBe('12')
  })

  it('maps name field', () => {
    const result = transformTeam(raw)
    expect(result.name).toBe('Level 2 Support')
  })

  it('places description in metadata', () => {
    const result = transformTeam(raw)
    expect(result.metadata['description']).toBe('Second-tier escalation team')
  })

  it('sets platform to movidesk', () => {
    const result = transformTeam(raw)
    expect(result.platform).toBe('movidesk')
  })

  it('produces a TeamSchema-valid result', () => {
    const result = transformTeam(raw)
    expect(() => TeamSchema.parse(result)).not.toThrow()
  })

  it('handles null id and name', () => {
    const minimal: RawMovideskTeam = { id: null, name: null }
    const result = transformTeam(minimal)
    expect(result.id).toBe('')
    expect(result.name).toBe('')
    expect(() => TeamSchema.parse(result)).not.toThrow()
  })
})
