import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawNutcacheProject,
} from '../../../../../../../src/verticals/projects/adapters/nutcache/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('nutcache transformProject', () => {
  const raw: RawNutcacheProject = {
    id: 101,
    name: 'Alpha Launch',
    description: 'Kick off the alpha program',
    status: 1,
    organization: 55,
    start_date: '2026-01-01T00:00:00.000Z',
    end_date: '2026-06-30T00:00:00.000Z',
    display_color: '#FF5722',
    project_type: 2,
    vision: 'Make it great',
    customer: 99,
  }

  it('maps id and name', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('101')
    expect(result.name).toBe('Alpha Launch')
  })

  it('maps workspaceId from organization', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('55')
  })

  it('maps description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Kick off the alpha program')
  })

  it('maps status 1 → active', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('maps status 0 → on_hold', () => {
    const result = transformProject({ id: 1, status: 0 })
    expect(result.status).toBe('on_hold')
  })

  it('maps status 2 → completed', () => {
    const result = transformProject({ id: 1, status: 2 })
    expect(result.status).toBe('completed')
  })

  it('maps status 3 → archived', () => {
    const result = transformProject({ id: 1, status: 3 })
    expect(result.status).toBe('archived')
  })

  it('maps status 4 → archived', () => {
    const result = transformProject({ id: 1, status: 4 })
    expect(result.status).toBe('archived')
  })

  it('maps unknown status → unknown', () => {
    const result = transformProject({ id: 1, status: 99 })
    expect(result.status).toBe('unknown')
  })

  it('maps start/end dates to ISO strings', () => {
    const result = transformProject(raw)
    expect(result.startDate).toMatch(/\.000Z$/)
    expect(result.endDate).toMatch(/\.000Z$/)
  })

  it('platform is nutcache', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('nutcache')
  })

  it('metadata includes displayColor and vision', () => {
    const result = transformProject(raw)
    expect(result.metadata.displayColor).toBe('#FF5722')
    expect(result.metadata.vision).toBe('Make it great')
  })

  it('workspaceId is empty string when organization is absent', () => {
    const result = transformProject({ id: 1 })
    expect(result.workspaceId).toBe('')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
