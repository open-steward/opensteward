import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawMeisterplanScenario,
} from '../../../../../../../src/verticals/projects/adapters/meisterplan/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('meisterplan transformWorkspace (scenario)', () => {
  const raw: RawMeisterplanScenario = {
    id: 'scenario-por',
    name: 'Plan of Record',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('scenario-por')
    expect(result.externalId).toBe('scenario-por')
  })

  it('maps name from raw.name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Plan of Record')
  })

  it('falls back name to id when name is absent', () => {
    const result = transformWorkspace({ id: 'scenario-x', name: null })
    expect(result.name).toBe('scenario-x')
  })

  it('platform is meisterplan', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('meisterplan')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
