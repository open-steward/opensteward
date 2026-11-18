import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawWorkfrontGroup,
} from '../../../../../../../src/verticals/projects/adapters/workfront/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('workfront transformWorkspace', () => {
  const raw: RawWorkfrontGroup = {
    ID: 'group-2',
    name: 'Product Engineering',
    description: 'All product teams',
    parentID: 'group-1',
  }

  it('maps id and externalId from ID', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('group-2')
    expect(result.externalId).toBe('group-2')
  })

  it('maps name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Product Engineering')
  })

  it('platform is workfront', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('workfront')
  })

  it('metadata contains description', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.description).toBe('All product teams')
  })

  it('metadata contains parentID', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.parentID).toBe('group-1')
  })

  it('metadata.description absent when not set', () => {
    const result = transformWorkspace({ ...raw, description: undefined })
    expect(result.metadata.description).toBeUndefined()
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
