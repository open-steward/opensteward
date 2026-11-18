import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawMeisterplanTask,
} from '../../../../../../../src/verticals/projects/adapters/meisterplan/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

/**
 * Fixture built from the documented `TaskResponse` example values in
 * https://api.us.meisterplan.com/swagger.json (GetAllTasks / GetTaskById):
 * key "TSK001", name "Implement new feature", status "OPEN",
 * externalViewUrl "https://example.org/task/123", rank 5, startDate
 * "2019-01-31", dueDate "2019-12-31", sprint { key "SPRINT-1" }, entity type
 * "RESOURCE", EffortValueResponse { computedHours 22.5, unit "STORY_POINTS",
 * value 22.5 }. The spec's example ids are the literal "UUID"; real uuids stand
 * in for them here.
 */
const raw: RawMeisterplanTask = {
  id: '5b0e1c7a-2a44-4d6e-9d0a-1f3a8a0c0001',
  key: 'TSK001',
  name: 'Implement new feature',
  status: 'OPEN',
  externalViewUrl: 'https://example.org/task/123',
  rank: 5,
  startDate: '2019-01-31',
  dueDate: '2019-12-31',
  effort: {
    assignments: [
      {
        entity: { id: '50703a7a-9285-4ffe-9e29-47187c454ade', type: 'RESOURCE' },
        remainingEffort: { computedHours: 22.5, unit: 'STORY_POINTS', value: 22.5 },
      },
      { entity: { id: '7c1f0d2e-0000-4000-8000-000000000002', type: 'ROLE' } },
    ],
  } as RawMeisterplanTask['effort'],
  sprint: { id: '9d8e7f6a-0000-4000-8000-000000000003', key: 'SPRINT-1' },
  type: 'TASK',
}

describe('meisterplan transformTask', () => {
  it('parses with TaskSchema from the documented example response', () => {
    const t = TaskSchema.parse(transformTask(raw, 'proj-1', 'PlanOfRecord'))
    expect(t).toMatchObject({
      id: '5b0e1c7a-2a44-4d6e-9d0a-1f3a8a0c0001',
      externalId: '5b0e1c7a-2a44-4d6e-9d0a-1f3a8a0c0001',
      projectId: 'proj-1',
      title: 'Implement new feature',
      status: 'open',
      dueDate: '2019-12-31T00:00:00.000Z',
      tagIds: [],
      platform: 'meisterplan',
    })
    expect(t.description).toBeUndefined()
    expect(t.createdAt).toBeUndefined()
  })

  it('maps each documented status: OPEN, IN_PROGRESS, CLOSED', () => {
    expect(TaskSchema.parse(transformTask({ ...raw, status: 'OPEN' }, 'p')).status).toBe('open')
    expect(TaskSchema.parse(transformTask({ ...raw, status: 'IN_PROGRESS' }, 'p')).status).toBe(
      'in_progress',
    )
    expect(TaskSchema.parse(transformTask({ ...raw, status: 'CLOSED' }, 'p')).status).toBe('closed')
  })

  it('an undocumented status is unknown, never guessed', () => {
    expect(TaskSchema.parse(transformTask({ ...raw, status: 'Done' }, 'p')).status).toBe('unknown')
    expect(TaskSchema.parse(transformTask({ ...raw, status: null }, 'p')).status).toBe('unknown')
  })

  it('assigneeIds are the RESOURCE assignment entities only', () => {
    const t = TaskSchema.parse(transformTask(raw, 'p'))
    expect(t.assigneeIds).toEqual(['50703a7a-9285-4ffe-9e29-47187c454ade'])
  })

  it('assigneeIds lists a resource once when it has several assignments', () => {
    const resource = { id: '50703a7a-9285-4ffe-9e29-47187c454ade', type: 'RESOURCE' }
    const t = TaskSchema.parse(
      transformTask(
        { ...raw, effort: { assignments: [{ entity: resource }, { entity: resource }] } },
        'p',
      ),
    )
    expect(t.assigneeIds).toEqual(['50703a7a-9285-4ffe-9e29-47187c454ade'])
  })

  it('assigneeIds is empty without effort', () => {
    expect(TaskSchema.parse(transformTask({ ...raw, effort: null }, 'p')).assigneeIds).toEqual([])
  })

  it('keeps the documented key, type, dates, rank, url and sprint in metadata', () => {
    const t = TaskSchema.parse(transformTask(raw, 'p', 'PlanOfRecord'))
    expect(t.metadata).toEqual({
      scenarioId: 'PlanOfRecord',
      key: 'TSK001',
      statusRaw: 'OPEN',
      type: 'TASK',
      startDate: '2019-01-31',
      rank: '5',
      externalViewUrl: 'https://example.org/task/123',
      sprintId: '9d8e7f6a-0000-4000-8000-000000000003',
      sprintKey: 'SPRINT-1',
    })
  })

  it('a null dueDate is omitted', () => {
    expect(TaskSchema.parse(transformTask({ ...raw, dueDate: null }, 'p')).dueDate).toBeUndefined()
  })

  it('throws on a task with no id rather than inventing one', () => {
    expect(() => transformTask({ ...raw, id: undefined }, 'p')).toThrow(/no id/)
    expect(() => transformTask({ ...raw, id: '' }, 'p')).toThrow(/no id/)
  })

  it('throws on a task with no name rather than inventing a title', () => {
    expect(() => transformTask({ ...raw, name: undefined }, 'p')).toThrow(/no name/)
  })
})
