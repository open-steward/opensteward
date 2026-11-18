import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawRedmineProject,
} from '../../../../../../../src/verticals/projects/adapters/redmine/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('redmine transformProject', () => {
  const raw: RawRedmineProject = {
    id: 12,
    identifier: 'my-project',
    name: 'My Project',
    description: 'A test project',
    status: 1,
    created_on: '2024-01-15T10:00:00.000Z',
    updated_on: '2024-06-01T08:30:00.000Z',
  }

  it('maps id to string', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('12')
    expect(result.externalId).toBe('12')
  })

  it('maps name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('My Project')
  })

  it('workspaceId is empty string (no workspace concept)', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('')
  })

  it('platform is redmine', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('redmine')
  })

  it('metadata includes identifier', () => {
    const result = transformProject(raw)
    expect(result.metadata.identifier).toBe('my-project')
  })

  it('maps description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('A test project')
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-01T08:30:00.000Z')
  })

  describe('status mapping', () => {
    it('status 5 maps to archived', () => {
      const result = transformProject({ ...raw, status: 5 })
      expect(result.status).toBe('archived')
    })

    it('status 9 maps to completed', () => {
      const result = transformProject({ ...raw, status: 9 })
      expect(result.status).toBe('completed')
    })

    it('status 1 maps to active', () => {
      const result = transformProject({ ...raw, status: 1 })
      expect(result.status).toBe('active')
    })

    it('unknown status maps to active (default)', () => {
      const result = transformProject({ ...raw, status: 99 })
      expect(result.status).toBe('active')
    })

    it('absent status maps to active (default)', () => {
      const result = transformProject({ id: 1 })
      expect(result.status).toBe('active')
    })
  })

  it('metadata includes parentId and parentName when parent present', () => {
    const result = transformProject({ ...raw, parent: { id: 3, name: 'Parent Project' } })
    expect(result.metadata.parentId).toBe('3')
    expect(result.metadata.parentName).toBe('Parent Project')
  })

  it('parentId and parentName absent from metadata when no parent', () => {
    const result = transformProject(raw)
    expect(result.metadata.parentId).toBeUndefined()
    expect(result.metadata.parentName).toBeUndefined()
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
