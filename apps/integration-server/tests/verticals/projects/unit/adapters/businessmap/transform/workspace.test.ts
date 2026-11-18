import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawBusinessmapWorkspace,
} from '../../../../../../../src/verticals/projects/adapters/businessmap/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('businessmap transformWorkspace', () => {
  const raw: RawBusinessmapWorkspace = {
    workspace_id: 7,
    name: 'Acme Engineering',
    description: 'Engineering team workspace.',
  }

  it('maps id and externalId from workspace_id', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
  })

  it('maps name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Acme Engineering')
  })

  it('platform is businessmap', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('businessmap')
  })

  it('metadata.description reflects description', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.description).toBe('Engineering team workspace.')
  })

  it('id is empty string when workspace_id is absent', () => {
    const result = transformWorkspace({})
    expect(result.id).toBe('')
  })

  it('name is empty string when absent', () => {
    const result = transformWorkspace({ workspace_id: 1 })
    expect(result.name).toBe('')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
