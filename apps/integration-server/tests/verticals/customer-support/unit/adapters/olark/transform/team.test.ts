import { describe, it, expect } from 'vitest'
import {
  transformTeam,
  type RawOlarkGroup,
} from '../../../../../../../src/verticals/customer-support/adapters/olark/transform/team'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema/team'

describe('olark transformTeam', () => {
  const raw: RawOlarkGroup = {
    id: 'grp-olark-1',
    name: 'Sales Chat Team',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformTeam(raw)
    expect(result.id).toBe('grp-olark-1')
    expect(result.externalId).toBe('grp-olark-1')
  })

  it('maps name field', () => {
    const result = transformTeam(raw)
    expect(result.name).toBe('Sales Chat Team')
  })

  it('sets platform to olark', () => {
    const result = transformTeam(raw)
    expect(result.platform).toBe('olark')
  })

  it('metadata is an empty object', () => {
    const result = transformTeam(raw)
    expect(result.metadata).toEqual({})
  })

  it('produces a TeamSchema-valid result', () => {
    const result = transformTeam(raw)
    expect(() => TeamSchema.parse(result)).not.toThrow()
  })

  it('handles missing name — falls back to empty string', () => {
    const minimal: RawOlarkGroup = { id: 'grp-2' }
    const result = transformTeam(minimal)
    expect(result.name).toBe('')
    expect(() => TeamSchema.parse(result)).not.toThrow()
  })
})
