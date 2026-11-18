import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawStackbyStack,
} from '../../../../../../../src/verticals/projects/adapters/stackby/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('stackby transformProject', () => {
  const raw: RawStackbyStack = {
    stackId: 'stk_abc123',
    tableName: 'Tasks',
    stackName: 'Acme Project',
  }

  it('maps id as composite stackId/tableName', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('stk_abc123/Tasks')
    expect(result.externalId).toBe('stk_abc123/Tasks')
  })

  it('maps workspaceId from stackId', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('stk_abc123')
  })

  it('maps name from stackName when present', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Acme Project')
  })

  it('falls back to tableName when stackName is absent', () => {
    const result = transformProject({ stackId: 'stk_abc123', tableName: 'Tasks' })
    expect(result.name).toBe('Tasks')
  })

  it('status is always active', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('platform is stackby', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('stackby')
  })

  it('metadata contains stackId and tableName', () => {
    const result = transformProject(raw)
    expect(result.metadata.stackId).toBe('stk_abc123')
    expect(result.metadata.tableName).toBe('Tasks')
  })

  it('description is undefined (not set by this transform)', () => {
    const result = transformProject(raw)
    expect(result.description).toBeUndefined()
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
