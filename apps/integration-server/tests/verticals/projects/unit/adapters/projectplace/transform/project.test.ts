import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawProjectplaceProject,
} from '../../../../../../../src/verticals/projects/adapters/projectplace/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('projectplace transformProject', () => {
  // Timestamps as Unix epoch seconds
  const raw: RawProjectplaceProject = {
    id: 7777,
    name: 'Website Redesign',
    description: 'Full redesign of corporate website.',
    archived: false,
    status: 'active',
    owner: { id: 42, name: 'Henry Ford' },
    start_time: 1735689600, // 2025-01-01T00:00:00.000Z
    due_time: 1751328000, // 2025-07-01T00:00:00.000Z
    create_time: 1704067200, // 2024-01-01T00:00:00.000Z
    modify_time: 1746057600, // 2025-05-01T00:00:00.000Z
  }

  it('maps id as string', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('7777')
    expect(result.externalId).toBe('7777')
  })

  it('workspaceId equals id (project is the workspace)', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('7777')
  })

  it('maps name correctly', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Website Redesign')
  })

  it('maps description correctly', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Full redesign of corporate website.')
  })

  it('status active for status=active', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status archived when archived=true', () => {
    const result = transformProject({ ...raw, archived: true })
    expect(result.status).toBe('archived')
  })

  it('status archived when is_archived=true', () => {
    const result = transformProject({ ...raw, is_archived: true })
    expect(result.status).toBe('archived')
  })

  it('status completed when status="completed"', () => {
    const result = transformProject({ ...raw, status: 'completed' })
    expect(result.status).toBe('completed')
  })

  it('status on_hold when status="on_hold"', () => {
    const result = transformProject({ ...raw, status: 'on_hold' })
    expect(result.status).toBe('on_hold')
  })

  it('ownerId comes from owner.id as string', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('42')
  })

  it('ownerId falls back to owner_id when owner object absent', () => {
    const result = transformProject({ ...raw, owner: null, owner_id: 99 })
    expect(result.ownerId).toBe('99')
  })

  it('startDate converts epoch seconds', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBe(new Date(1735689600 * 1000).toISOString())
  })

  it('endDate converts epoch seconds', () => {
    const result = transformProject(raw)
    expect(result.endDate).toBe(new Date(1751328000 * 1000).toISOString())
  })

  it('createdAt converts epoch seconds', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe(new Date(1704067200 * 1000).toISOString())
  })

  it('updatedAt converts epoch seconds', () => {
    const result = transformProject(raw)
    expect(result.updatedAt).toBe(new Date(1746057600 * 1000).toISOString())
  })

  it('platform is projectplace', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('projectplace')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
