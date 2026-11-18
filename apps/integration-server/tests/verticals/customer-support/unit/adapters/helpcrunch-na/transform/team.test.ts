import { describe, it, expect } from 'vitest'
import {
  transformTeam,
  type RawInvGateGroup,
} from '../../../../../../../src/verticals/customer-support/adapters/helpcrunch-na/transform/team'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema/team'

describe('helpcrunch-na transformTeam', () => {
  const raw: RawInvGateGroup = {
    id: 8,
    name: 'Tier 2 Support',
    total: 12,
  }

  it('maps id to string id and externalId', () => {
    const result = transformTeam(raw)
    expect(result.id).toBe('8')
    expect(result.externalId).toBe('8')
  })

  it('maps name field', () => {
    const result = transformTeam(raw)
    expect(result.name).toBe('Tier 2 Support')
  })

  it('sets platform to helpcrunch-na', () => {
    const result = transformTeam(raw)
    expect(result.platform).toBe('helpcrunch-na')
  })

  it('stores memberCount (total) in metadata', () => {
    const result = transformTeam(raw)
    expect(result.metadata['memberCount']).toBe('12')
  })

  it('produces a TeamSchema-valid result', () => {
    const result = transformTeam(raw)
    expect(() => TeamSchema.parse(result)).not.toThrow()
  })

  it('handles missing name — defaults to empty string', () => {
    const noName: RawInvGateGroup = { id: 1, name: null }
    const result = transformTeam(noName)
    expect(result.name).toBe('')
    expect(() => TeamSchema.parse(result)).not.toThrow()
  })

  it('handles missing total — memberCount absent from metadata', () => {
    const noTotal: RawInvGateGroup = { id: 2, name: 'Empty Group' }
    const result = transformTeam(noTotal)
    expect(result.metadata['memberCount']).toBeUndefined()
  })
})
