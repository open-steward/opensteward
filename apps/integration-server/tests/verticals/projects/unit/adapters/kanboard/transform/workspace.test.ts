import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawKanboardWorkspace,
} from '../../../../../../../src/verticals/projects/adapters/kanboard/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('kanboard transformWorkspace', () => {
  const raw: RawKanboardWorkspace = {
    id: 'default',
    name: 'https://kanboard.example.com',
    version: '1.2.36',
  }

  it('maps id (or defaults to "default")', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('default')
    expect(result.externalId).toBe('default')
  })

  it('maps name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('https://kanboard.example.com')
  })

  it('name defaults to Kanboard when absent', () => {
    const result = transformWorkspace({})
    expect(result.name).toBe('Kanboard')
  })

  it('id defaults to "default" when absent', () => {
    const result = transformWorkspace({})
    expect(result.id).toBe('default')
  })

  it('platform is kanboard', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('kanboard')
  })

  it('metadata contains version', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.version).toBe('1.2.36')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
