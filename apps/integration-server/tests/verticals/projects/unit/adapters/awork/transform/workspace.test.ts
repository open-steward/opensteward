import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawAworkWorkspace,
} from '../../../../../../../src/verticals/projects/adapters/awork/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('awork transformWorkspace', () => {
  const raw: RawAworkWorkspace = {
    id: 'ws-awork-1',
    name: 'Acme Workspace',
    description: 'Our main awork workspace.',
    type: 'professional',
    memberCount: 25,
    createdOn: '2024-01-01T00:00:00Z',
    updatedOn: '2024-06-01T00:00:00Z',
  }

  it('maps id and externalId', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('ws-awork-1')
    expect(result.externalId).toBe('ws-awork-1')
  })

  it('maps name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Acme Workspace')
  })

  it('maps memberCount', () => {
    const result = transformWorkspace(raw)
    expect(result.memberCount).toBe(25)
  })

  it('memberCount is undefined when absent', () => {
    const result = transformWorkspace({ id: 'ws-2', name: 'Empty', memberCount: null })
    expect(result.memberCount).toBeUndefined()
  })

  it('platform is awork', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('awork')
  })

  it('metadata.description is set', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.description).toBe('Our main awork workspace.')
  })

  it('metadata.type is set', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.type).toBe('professional')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })

  it('name is empty string when absent', () => {
    const result = transformWorkspace({ id: 'ws-3', name: null })
    expect(result.name).toBe('')
  })
})
