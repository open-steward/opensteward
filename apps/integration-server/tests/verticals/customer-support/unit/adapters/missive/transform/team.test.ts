import { describe, it, expect } from 'vitest'
import {
  transformTeam,
  type RawMissiveTeam,
} from '../../../../../../../src/verticals/customer-support/adapters/missive/transform/team'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema/team'

describe('missive transformTeam', () => {
  const raw: RawMissiveTeam = {
    id: 'team-001',
    name: 'Tier 1 Support',
    organization: { id: 'org-99' },
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformTeam(raw)
    expect(result.id).toBe('team-001')
    expect(result.externalId).toBe('team-001')
  })

  it('maps name field', () => {
    const result = transformTeam(raw)
    expect(result.name).toBe('Tier 1 Support')
  })

  it('places organizationId in metadata', () => {
    const result = transformTeam(raw)
    expect(result.metadata['organizationId']).toBe('org-99')
  })

  it('sets platform to missive', () => {
    const result = transformTeam(raw)
    expect(result.platform).toBe('missive')
  })

  it('produces a TeamSchema-valid result', () => {
    const result = transformTeam(raw)
    expect(() => TeamSchema.parse(result)).not.toThrow()
  })

  it('handles missing name — falls back to empty string', () => {
    const minimal: RawMissiveTeam = { id: 'team-x' }
    const result = transformTeam(minimal)
    expect(result.name).toBe('')
    expect(() => TeamSchema.parse(result)).not.toThrow()
  })
})
