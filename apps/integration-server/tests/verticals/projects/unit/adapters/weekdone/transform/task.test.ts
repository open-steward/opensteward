import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawWeekdoneItem,
} from '../../../../../../../src/verticals/projects/adapters/weekdone/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('weekdone transformTask', () => {
  const raw: RawWeekdoneItem = {
    id: 55,
    description: 'Finish Q1 report',
    type_id: 2,
    team_id: 9,
    user_id: 3,
    priority: 2,
    from_id: 10,
    due_on: '2026-03-15T00:00:00.000Z',
    inserted: '2026-01-10T08:00:00.000Z',
    updated: '2026-01-20T09:00:00.000Z',
    commentcount: 4,
  }

  it('id is stringified item id', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('55')
  })

  it('externalId equals id', () => {
    const result = transformTask(raw)
    expect(result.externalId).toBe('55')
  })

  it('projectId uses explicit arg when provided', () => {
    const result = transformTask(raw, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('projectId falls back to team_id when no arg given', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('9')
  })

  it('projectId is empty string when team_id is also absent', () => {
    const result = transformTask({ id: 1 })
    expect(result.projectId).toBe('')
  })

  it('title maps from description field', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Finish Q1 report')
  })

  it('title is empty string when description is absent', () => {
    const result = transformTask({ id: 1 })
    expect(result.title).toBe('')
  })

  it('status is always open', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('parentId is derived from from_id', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBe('10')
  })

  it('parentId is undefined when from_id is absent', () => {
    const result = transformTask({ id: 1 })
    expect(result.parentId).toBeUndefined()
  })

  it('assigneeIds contains the user_id', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['3'])
  })

  it('assigneeIds is empty when user_id is absent', () => {
    const result = transformTask({ id: 1 })
    expect(result.assigneeIds).toEqual([])
  })

  it('tagIds is always empty', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual([])
  })

  it('priority maps 1 -> urgent', () => {
    const result = transformTask({ ...raw, priority: 1 })
    expect(result.priority).toBe('urgent')
  })

  it('priority maps 2 -> high', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('priority maps 3 -> medium', () => {
    const result = transformTask({ ...raw, priority: 3 })
    expect(result.priority).toBe('medium')
  })

  it('priority maps 4+ -> low', () => {
    const result = transformTask({ ...raw, priority: 5 })
    expect(result.priority).toBe('low')
  })

  it('priority is undefined when absent', () => {
    const result = transformTask({ id: 1 })
    expect(result.priority).toBeUndefined()
  })

  it('dueDate is converted from due_on', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe(new Date('2026-03-15T00:00:00.000Z').toISOString())
  })

  it('createdAt is converted from inserted', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBe(new Date('2026-01-10T08:00:00.000Z').toISOString())
  })

  it('updatedAt is converted from updated', () => {
    const result = transformTask(raw)
    expect(result.updatedAt).toBe(new Date('2026-01-20T09:00:00.000Z').toISOString())
  })

  it('platform is weekdone', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('weekdone')
  })

  it('metadata contains typeLabel "progress" for type_id=2', () => {
    const result = transformTask(raw)
    expect(result.metadata.typeLabel).toBe('progress')
  })

  it('metadata contains typeLabel "plans" for type_id=1', () => {
    const result = transformTask({ ...raw, type_id: 1 })
    expect(result.metadata.typeLabel).toBe('plans')
  })

  it('metadata contains typeLabel "problems" for type_id=3', () => {
    const result = transformTask({ ...raw, type_id: 3 })
    expect(result.metadata.typeLabel).toBe('problems')
  })

  it('metadata contains typeLabel "unknown" for absent type_id', () => {
    const result = transformTask({ id: 1 })
    expect(result.metadata.typeLabel).toBe('unknown')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it('passes TaskSchema.parse with minimal input', () => {
    const result = transformTask({ id: 1 })
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
