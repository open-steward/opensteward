import { describe, it, expect } from 'vitest'
import {
  transformTeam,
  type RawOctadeskGroup,
} from '../../../../../../../src/verticals/customer-support/adapters/octadesk/transform/team'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema/team'

describe('octadesk transformTeam', () => {
  const raw: RawOctadeskGroup = {
    id: 'group-uuid-1',
    name: 'Suporte Nível 1',
    description: 'First level support group',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformTeam(raw)
    expect(result.id).toBe('group-uuid-1')
    expect(result.externalId).toBe('group-uuid-1')
  })

  it('maps name field', () => {
    const result = transformTeam(raw)
    expect(result.name).toBe('Suporte Nível 1')
  })

  it('places description in metadata', () => {
    const result = transformTeam(raw)
    expect(result.metadata['description']).toBe('First level support group')
  })

  it('sets platform to octadesk', () => {
    const result = transformTeam(raw)
    expect(result.platform).toBe('octadesk')
  })

  it('produces a TeamSchema-valid result', () => {
    const result = transformTeam(raw)
    expect(() => TeamSchema.parse(result)).not.toThrow()
  })

  it('handles missing name — falls back to empty string', () => {
    const minimal: RawOctadeskGroup = { id: 'grp-x' }
    const result = transformTeam(minimal)
    expect(result.name).toBe('')
    expect(() => TeamSchema.parse(result)).not.toThrow()
  })
})
