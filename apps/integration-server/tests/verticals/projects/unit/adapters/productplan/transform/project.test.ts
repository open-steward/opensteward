import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawProductplanRoadmap,
} from '../../../../../../../src/verticals/projects/adapters/productplan/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('productplan transformProject', () => {
  const raw: RawProductplanRoadmap = {
    id: 42,
    name: 'Q3 Roadmap',
    description: 'All planned features for Q3.',
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-06-15T12:00:00.000Z',
    is_version: false,
  }

  it('maps id as string', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps name correctly', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Q3 Roadmap')
  })

  it('maps description correctly', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('All planned features for Q3.')
  })

  it('status is always active', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('workspaceId is empty string', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('')
  })

  it('createdAt and updatedAt are ISO 8601', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2025-06-15T12:00:00.000Z')
  })

  it('platform is productplan', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('productplan')
  })

  it('metadata includes isVersion', () => {
    const result = transformProject({ ...raw, is_version: true })
    expect(result.metadata.isVersion).toBe('true')
  })

  it('works with numeric string id', () => {
    const result = transformProject({ ...raw, id: '99' })
    expect(result.id).toBe('99')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
