import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawPerdooGroup,
} from '../../../../../../../src/verticals/projects/adapters/perdoo/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('perdoo transformWorkspace', () => {
  const raw: RawPerdooGroup = {
    id: 'group-sales',
    name: 'Sales Team',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('group-sales')
    expect(result.externalId).toBe('group-sales')
  })

  it('maps name from raw.name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Sales Team')
  })

  it('name falls back to empty string when raw.name is absent', () => {
    const result = transformWorkspace({ id: 'group-no-name' })
    expect(result.name).toBe('')
  })

  it('platform is perdoo', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('perdoo')
  })

  it('metadata is an empty record', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata).toEqual({})
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
