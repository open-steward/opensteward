import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawFloatProjectTask,
} from '../../../../../../../src/verticals/projects/adapters/float/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('float transformTask', () => {
  const raw: RawFloatProjectTask = {
    task_id: 55,
    project_id: 99,
    phase_id: 10,
    name: 'Design mockups',
    billable: 1,
    budget: '500',
    count_tasks: 3,
    created: '2026-02-01 09:00:00',
    modified: '2026-03-15 14:00:00',
  }

  it('id is composite "{project_id}:{task_id}"', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('99:55')
  })

  it('externalId is the bare task_id as string', () => {
    const result = transformTask(raw)
    expect(result.externalId).toBe('55')
  })

  it('projectId comes from raw.project_id', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('99')
  })

  it('caller-supplied projectId overrides raw.project_id', () => {
    const result = transformTask(raw, 'proj-override')
    expect(result.projectId).toBe('proj-override')
    expect(result.id).toBe('proj-override:55')
  })

  it('maps phase_id to parentId as string', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBe('10')
  })

  it('parentId is undefined when phase_id is absent', () => {
    const result = transformTask({ ...raw, phase_id: null })
    expect(result.parentId).toBeUndefined()
  })

  it('maps name to title', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Design mockups')
  })

  it('status is always "open"', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('assigneeIds is always an empty array', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual([])
  })

  it('tagIds is always an empty array', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual([])
  })

  it('platform is float', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('float')
  })

  it('metadata.platformType is "project_task"', () => {
    const result = transformTask(raw)
    expect(result.metadata.platformType).toBe('project_task')
  })

  it('metadata.billable is "true" when billable=1', () => {
    const result = transformTask(raw)
    expect(result.metadata.billable).toBe('true')
  })

  it('metadata.billable is "false" when billable=0', () => {
    const result = transformTask({ ...raw, billable: 0 })
    expect(result.metadata.billable).toBe('false')
  })

  it('metadata.budget comes from budget string via pickNum', () => {
    const result = transformTask(raw)
    expect(result.metadata.budget).toBe('500')
  })

  it('metadata.countTasks comes from count_tasks numeric', () => {
    const result = transformTask(raw)
    expect(result.metadata.countTasks).toBe('3')
  })

  it('uses project_task_id when task_id is absent', () => {
    const raw2: RawFloatProjectTask = {
      project_task_id: 77,
      project_id: 99,
      name: 'Alt task',
    }
    const result = transformTask(raw2)
    expect(result.externalId).toBe('77')
    expect(result.id).toBe('99:77')
  })

  it('createdAt and updatedAt are undefined (not mapped)', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it('handles minimal raw object gracefully', () => {
    const result = transformTask({}, 'proj-1')
    expect(result.id).toBe('proj-1:')
    expect(result.externalId).toBe('')
    expect(result.title).toBe('')
    expect(result.status).toBe('open')
    expect(result.assigneeIds).toEqual([])
    expect(result.tagIds).toEqual([])
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
