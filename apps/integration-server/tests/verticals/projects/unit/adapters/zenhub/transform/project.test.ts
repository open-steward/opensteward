import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawZenhubRepository,
} from '../../../../../../../src/verticals/projects/adapters/zenhub/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('zenhub transformProject', () => {
  const raw: RawZenhubRepository = {
    id: 'repo-1',
    ghId: 123456,
    name: 'my-repo',
    fullPath: 'org/my-repo',
  }

  it('maps id and externalId', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('repo-1')
    expect(result.externalId).toBe('repo-1')
  })

  it('maps name from fullPath when present', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('org/my-repo')
  })

  it('falls back to name when fullPath absent', () => {
    const result = transformProject({ ...raw, fullPath: undefined })
    expect(result.name).toBe('my-repo')
  })

  it('name is empty string when both fullPath and name absent', () => {
    const result = transformProject({ ...raw, fullPath: undefined, name: undefined })
    expect(result.name).toBe('')
  })

  it('maps workspaceId from argument', () => {
    const result = transformProject(raw, 'ws-1')
    expect(result.workspaceId).toBe('ws-1')
  })

  it('workspaceId is empty string when argument absent', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('')
  })

  it('status is always active', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('platform is zenhub', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('zenhub')
  })

  it('metadata includes ghId and name', () => {
    const result = transformProject(raw)
    expect(result.metadata.ghId).toBe('123456')
    expect(result.metadata.name).toBe('my-repo')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw, 'ws-1')
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
