import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawSuiteProjectsTask,
} from '../../../../../../../src/verticals/projects/adapters/suiteprojects-pro/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('suiteprojects-pro transformTask', () => {
  const raw: RawSuiteProjectsTask = {
    id: 55,
    name: 'Design mockup',
    notes: 'Create hi-fi mockups for the homepage.',
    isClosed: false,
    projectId: 101,
    parentId: 10,
    assignedUsers: [{ id: 3 }, { id: 7 }],
    startDate: '2026-01-15',
    calculatedFinishes: '2026-02-15',
    fnltDate: '2026-02-28',
    priority: 3,
    percentComplete: 40,
    plannedHours: 16,
    created: '2026-01-10T08:00:00.000Z',
    updated: '2026-01-20T08:00:00.000Z',
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('55')
    expect(result.externalId).toBe('55')
  })

  it('uses passed projectId over raw.projectId', () => {
    const result = transformTask(raw, 'override-proj')
    expect(result.projectId).toBe('override-proj')
  })

  it('falls back to raw.projectId when no projectId arg', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('101')
  })

  it('maps title from name', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Design mockup')
  })

  it('maps description from notes', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Create hi-fi mockups for the homepage.')
  })

  it('status is open when isClosed is false', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('status is closed when isClosed is true', () => {
    const result = transformTask({ ...raw, isClosed: true })
    expect(result.status).toBe('closed')
  })

  it('status is closed when isClosed is 1', () => {
    const result = transformTask({ ...raw, isClosed: 1 })
    expect(result.status).toBe('closed')
  })

  it('priority maps 3–4 to high', () => {
    const result = transformTask(raw) // priority: 3
    expect(result.priority).toBe('high')
  })

  it('priority maps 1–2 to urgent', () => {
    const result = transformTask({ ...raw, priority: 1 })
    expect(result.priority).toBe('urgent')
  })

  it('priority maps 5–6 to medium', () => {
    const result = transformTask({ ...raw, priority: 5 })
    expect(result.priority).toBe('medium')
  })

  it('priority maps 7+ to low', () => {
    const result = transformTask({ ...raw, priority: 9 })
    expect(result.priority).toBe('low')
  })

  it('priority is undefined when absent', () => {
    const result = transformTask({ id: 1 })
    expect(result.priority).toBeUndefined()
  })

  it('maps assigneeIds from assignedUsers array', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['3', '7'])
  })

  it('prefers calculatedFinishes over fnltDate for dueDate', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe(new Date('2026-02-15').toISOString())
  })

  it('falls back to fnltDate when calculatedFinishes is absent', () => {
    const result = transformTask({ ...raw, calculatedFinishes: undefined })
    expect(result.dueDate).toBe(new Date('2026-02-28').toISOString())
  })

  it('maps parentId when present and non-zero', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBe('10')
  })

  it('omits parentId when parentId is 0', () => {
    const result = transformTask({ ...raw, parentId: 0 })
    expect(result.parentId).toBeUndefined()
  })

  it('omits parentId when parentId is "0"', () => {
    const result = transformTask({ ...raw, parentId: '0' })
    expect(result.parentId).toBeUndefined()
  })

  it('metadata contains percentComplete and plannedHours', () => {
    const result = transformTask(raw)
    expect(result.metadata.percentComplete).toBe('40')
    expect(result.metadata.plannedHours).toBe('16')
  })

  it('platform is suiteprojects-pro', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('suiteprojects-pro')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
