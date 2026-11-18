/** project.task rows; fields from addons/project/models/project_task.py 19.0 and project.py 14.0–16.0. */
import { describe, expect, it } from 'vitest'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'
import {
  taskPriority,
  transformTask,
} from '../../../../../../../src/verticals/projects/adapters/odoo-project/transform/task'

/** 19.0: [('0', 'Low priority'), ('1', 'Medium priority'), ('2', 'High priority'), ('3', 'Urgent')] */
const SEL_19 = ['0', '1', '2', '3']
/** 14.0–18.0: [('0', 'Normal'|'Low'), ('1', 'Important'|'High')] */
const SEL_18 = ['0', '1']

const base = {
  id: 21,
  active: true,
  name: 'Meeting room furnitures',
  description: '<p>Chairs<br>Tables</p>',
  priority: '2',
  stage_id: [3, 'In Progress'] as [number, string],
  tag_ids: [5],
  state: '01_in_progress',
  is_closed: false,
  date_deadline: '2026-02-10 17:00:00',
  project_id: [4, 'Office Design'] as [number, string],
  user_ids: [2, 6],
  company_id: [1, 'YourCompany'] as [number, string],
  parent_id: false as const,
  subtask_count: 2,
  milestone_id: [8, 'Phase 1'] as [number, string],
  create_date: '2026-01-03 10:00:00',
  write_date: '2026-01-04 11:00:00',
}

describe('odoo-project transformTask (19.0)', () => {
  it('maps a task', () => {
    const t = TaskSchema.parse(transformTask(base, SEL_19))
    expect(t).toMatchObject({
      id: '21',
      externalId: '21',
      projectId: '4',
      title: 'Meeting room furnitures',
      description: 'Chairs\nTables',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2026-02-10T17:00:00.000Z',
      assigneeIds: ['2', '6'],
      tagIds: ['5'],
      subtaskCount: 2,
      createdAt: '2026-01-03T10:00:00.000Z',
      updatedAt: '2026-01-04T11:00:00.000Z',
      platform: 'odoo-project',
    })
    expect(t.parentId).toBeUndefined()
    expect(t.metadata).toEqual({
      platformType: 'task',
      stageId: '3',
      stageName: 'In Progress',
      state: '01_in_progress',
      priority: '2',
      milestoneId: '8',
      companyId: '1',
      active: 'true',
    })
  })

  it.each([
    ['01_in_progress', 'in_progress'],
    ['02_changes_requested', 'in_progress'],
    ['03_approved', 'in_review'],
    ['04_waiting_normal', 'open'],
    ['1_done', 'closed'],
    ['1_canceled', 'cancelled'],
    ['99_custom', 'unknown'],
  ])('state %s is %s', (state, status) => {
    expect(TaskSchema.parse(transformTask({ ...base, state }, SEL_19)).status).toBe(status)
  })

  it('a subtask points at its parent', () => {
    const t = TaskSchema.parse(transformTask({ ...base, parent_id: [20, 'Parent'] }, SEL_19))
    expect(t.parentId).toBe('20')
    expect(t.metadata['platformType']).toBe('subtask')
  })

  it('a private task has an empty project', () => {
    const t = TaskSchema.parse(transformTask({ ...base, project_id: false }, SEL_19))
    expect(t.projectId).toBe('')
  })
})

describe('odoo-project transformTask priority', () => {
  it.each([
    ['0', SEL_19, 'low'],
    ['1', SEL_19, 'medium'],
    ['2', SEL_19, 'high'],
    ['3', SEL_19, 'urgent'],
    ['0', SEL_18, 'low'],
    ['1', SEL_18, 'high'],
  ] as const)('key %s of a %j selection is %s', (key, sel, expected) => {
    expect(taskPriority(key, sel)).toBe(expected)
    expect(TaskSchema.parse(transformTask({ ...base, priority: key }, sel)).priority).toBe(expected)
  })

  it('is left out without the selection, or with an unknown one', () => {
    expect(TaskSchema.parse(transformTask(base)).priority).toBeUndefined()
    expect(TaskSchema.parse(transformTask(base, ['0', '1', '2'])).priority).toBeUndefined()
    expect(TaskSchema.parse(transformTask({ ...base, priority: '9' }, SEL_19)).priority).toBe(
      undefined,
    )
  })
})

describe('odoo-project transformTask (14.0–16.0)', () => {
  // No `state`; kanban_state + is_closed; 14.0 has user_id, not user_ids; Date deadline.
  const v14 = {
    id: 30,
    active: true,
    name: 'Old task',
    description: false as const,
    priority: '1',
    stage_id: [1, 'New'] as [number, string],
    tag_ids: [],
    kanban_state: 'normal',
    is_closed: false,
    date_deadline: '2021-05-01',
    project_id: [2, 'Legacy'] as [number, string],
    user_id: [2, 'Mitchell Admin'] as [number, string],
    company_id: [1, 'YourCompany'] as [number, string],
    parent_id: false as const,
    subtask_count: 0,
    create_date: '2021-04-01 00:00:00',
    write_date: '2021-04-02 00:00:00',
  }

  it('maps a 14.0 task', () => {
    const t = TaskSchema.parse(transformTask(v14, SEL_18))
    expect(t).toMatchObject({
      status: 'in_progress',
      priority: 'high',
      dueDate: '2021-05-01T00:00:00.000Z',
      assigneeIds: ['2'],
      tagIds: [],
      subtaskCount: 0,
    })
    expect(t.description).toBeUndefined()
    expect(t.metadata['kanbanState']).toBe('normal')
    expect(t.metadata['state']).toBeUndefined()
  })

  it.each([
    ['normal', false, 'in_progress'],
    ['blocked', false, 'in_progress'],
    ['done', false, 'in_review'],
    ['normal', true, 'closed'],
    ['done', true, 'closed'],
  ] as const)('kanban_state %s, is_closed %s is %s', (kanban_state, is_closed, status) => {
    expect(
      TaskSchema.parse(transformTask({ ...v14, kanban_state, is_closed }, SEL_18)).status,
    ).toBe(status)
  })

  it('an unassigned 14.0 task has no assignees', () => {
    expect(TaskSchema.parse(transformTask({ ...v14, user_id: false })).assigneeIds).toEqual([])
  })

  it('a row with only an id still parses', () => {
    const t = TaskSchema.parse(transformTask({ id: 1 }))
    expect(t).toMatchObject({ id: '1', title: '', status: 'unknown', assigneeIds: [], tagIds: [] })
  })
})
