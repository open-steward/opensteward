import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawOnesProject,
} from '../../../../../../../src/verticals/projects/adapters/ones/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('ones transformProject', () => {
  const raw: RawOnesProject = {
    id: 'proj_abc',
    name: 'Website Redesign',
    createTime: 1700000000,
    updateTime: 1700500000,
    owner: { id: 'usr_1', name: 'Bob' },
    status: { id: 'st_1', name: 'In Progress', category: 'in_progress' },
    isArchive: false,
    plannedStartDate: '2026-01-01',
    plannedEndDate: '2026-06-30',
  }

  it('maps id and name', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('proj_abc')
    expect(result.name).toBe('Website Redesign')
  })

  it('workspaceId is always empty string', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('')
  })

  it('maps ownerId from owner object', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('usr_1')
  })

  it('maps ownerId from owner string', () => {
    const result = transformProject({ ...raw, owner: 'usr_99' })
    expect(result.ownerId).toBe('usr_99')
  })

  it('status is active for in_progress category', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when isArchive is true', () => {
    const result = transformProject({ ...raw, isArchive: true })
    expect(result.status).toBe('archived')
  })

  it('status is completed when category contains "done"', () => {
    const result = transformProject({
      ...raw,
      status: { id: 'st_2', name: 'Done', category: 'done' },
    })
    expect(result.status).toBe('completed')
  })

  it('status is on_hold when category contains "pause"', () => {
    const result = transformProject({
      ...raw,
      status: { id: 'st_3', name: 'Paused', category: 'pause' },
    })
    expect(result.status).toBe('on_hold')
  })

  it('maps createdAt from epoch seconds', () => {
    const result = transformProject(raw)
    // 1700000000 is treated as epoch seconds → multiplied by 1000
    expect(result.createdAt).toBe(new Date(1700000000 * 1000).toISOString())
  })

  it('maps startDate and endDate from planned dates', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBeDefined()
    expect(result.endDate).toBeDefined()
  })

  it('platform is ones', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('ones')
  })

  it('description is always undefined (ones does not map it)', () => {
    const result = transformProject(raw)
    expect(result.description).toBeUndefined()
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
