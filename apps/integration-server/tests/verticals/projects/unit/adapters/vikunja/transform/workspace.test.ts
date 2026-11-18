import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawVikunjaWorkspace,
} from '../../../../../../../src/verticals/projects/adapters/vikunja/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('vikunja transformWorkspace', () => {
  const raw: RawVikunjaWorkspace = {
    id: 1,
    title: 'Engineering',
    description: 'All engineering projects',
    identifier: 'ENG',
    hex_color: '#6366f1',
    owner: {
      id: 5,
      username: 'admin',
      name: 'Admin User',
    },
    is_archived: false,
    created: '2023-06-01T00:00:00.000Z',
    updated: '2024-01-01T00:00:00.000Z',
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('1')
    expect(result.externalId).toBe('1')
  })

  it('maps name from title', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Engineering')
  })

  it('name is empty string when title is absent', () => {
    const r: RawVikunjaWorkspace = { id: 2 }
    const result = transformWorkspace(r)
    expect(result.name).toBe('')
  })

  it('platform is vikunja', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('vikunja')
  })

  it('metadata contains identifier', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.identifier).toBe('ENG')
  })

  it('metadata contains hexColor', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.hexColor).toBe('#6366f1')
  })

  it('metadata contains isArchived as string', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.isArchived).toBe('false')
  })

  it('metadata contains ownerUsername', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.ownerUsername).toBe('admin')
  })

  it('metadata ownerUsername absent when owner is null', () => {
    const r: RawVikunjaWorkspace = { id: 3, title: 'Orphan', owner: null }
    const result = transformWorkspace(r)
    expect(result.metadata.ownerUsername).toBeUndefined()
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
