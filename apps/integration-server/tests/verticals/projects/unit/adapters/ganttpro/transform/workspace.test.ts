import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawGanttproTeam,
} from '../../../../../../../src/verticals/projects/adapters/ganttpro/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

const rawTeam: RawGanttproTeam = {
  id: 7,
  ownerId: 99,
  name: 'Acme Team',
}

describe('transformWorkspace', () => {
  it('maps id to id as a string', () => {
    const result = transformWorkspace(rawTeam)
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
  })

  it('maps name directly', () => {
    const result = transformWorkspace(rawTeam)
    expect(result.name).toBe('Acme Team')
  })

  it('sets platform to "ganttpro"', () => {
    const result = transformWorkspace(rawTeam)
    expect(result.platform).toBe('ganttpro')
  })

  it('places ownerId in metadata as a string', () => {
    const result = transformWorkspace(rawTeam)
    expect(result.metadata['ownerId']).toBe('99')
  })

  it('passes schema validation', () => {
    const result = transformWorkspace(rawTeam)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })

  it('handles string id', () => {
    const result = transformWorkspace({ ...rawTeam, id: '55' })
    expect(result.id).toBe('55')
  })

  it('handles missing name with empty string fallback', () => {
    const result = transformWorkspace({ id: 1 })
    expect(result.name).toBe('')
  })
})
