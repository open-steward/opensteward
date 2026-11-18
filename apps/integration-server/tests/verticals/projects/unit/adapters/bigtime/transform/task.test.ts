import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawBigtimeTask,
} from '../../../../../../../src/verticals/projects/adapters/bigtime/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('bigtime transformTask', () => {
  const raw: RawBigtimeTask = {
    TaskSid: 500,
    ProjectSid: 1001,
    TaskNm: 'Design phase',
    Notes: 'Complete design docs',
    CurrentStatus: 1,
    IsArchived: false,
    PerComp: 0.5,
    Priority: 'HIGH',
    DueDt: '2025-06-01T00:00:00.000Z',
    StartDt: '2025-03-01T00:00:00.000Z',
    ParentSid: 0,
    BudgetHours: 40,
    AssignmentList: [101, { StaffSid: 202 }],
    DtCreated: '2025-01-01T00:00:00.000Z',
    DtModified: '2025-03-15T00:00:00.000Z',
  }

  it('maps id from TaskSid', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('500')
  })

  it('maps title from TaskNm', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Design phase')
  })

  it('projectId falls back to ProjectSid when no arg given', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('1001')
  })

  it('projectId uses explicit arg when provided', () => {
    const result = transformTask(raw, 'explicit_proj')
    expect(result.projectId).toBe('explicit_proj')
  })

  it('status is in_progress when PerComp is 0.5', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('in_progress')
  })

  it('status is closed when IsArchived is true', () => {
    const result = transformTask({ ...raw, IsArchived: true })
    expect(result.status).toBe('closed')
  })

  it('status is closed when PerComp is 1.0', () => {
    const result = transformTask({ ...raw, PerComp: 1.0, IsArchived: false })
    expect(result.status).toBe('closed')
  })

  it('status is open when PerComp is 0', () => {
    const result = transformTask({ ...raw, PerComp: 0, IsArchived: false })
    expect(result.status).toBe('open')
  })

  it('priority HIGH maps to high', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('priority MEDIUM maps to medium', () => {
    const result = transformTask({ ...raw, Priority: 'MEDIUM' })
    expect(result.priority).toBe('medium')
  })

  it('collects assigneeIds from mixed AssignmentList', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toContain('101')
    expect(result.assigneeIds).toContain('202')
  })

  it('parentId is undefined when ParentSid is 0', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('parentId is set when ParentSid is nonzero', () => {
    const result = transformTask({ ...raw, ParentSid: 99 })
    expect(result.parentId).toBe('99')
  })

  it('dueDate maps to ISO string', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2025-06-01T00:00:00.000Z')
  })

  it('platform is bigtime', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('bigtime')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw, '1001')
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
