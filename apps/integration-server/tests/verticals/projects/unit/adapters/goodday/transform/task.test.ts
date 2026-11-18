import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawGooddayTask,
} from '../../../../../../../src/verticals/projects/adapters/goodday/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('goodday transformTask', () => {
  const raw: RawGooddayTask = {
    id: 'task_abc',
    shortId: 'T-42',
    name: 'Implement login flow',
    message: 'Build the login screen per Figma spec.',
    projectId: 'proj_xyz',
    parentTaskId: 'task_parent',
    assignedToUserId: 'usr_jane',
    createdByUserId: 'usr_admin',
    deadline: 1710000000000,
    startDate: 1700000000000,
    endDate: 1705000000000,
    momentCreated: 1699000000000,
    recentActivityMoment: 1711000000000,
    priority: 3,
    estimate: 8,
    progress: 60,
    systemStatus: 'open',
    status: {
      id: 'status_1',
      name: 'In Progress',
      systemStatus: 'open',
    },
    taskType: {
      id: 'type_1',
      name: 'Feature',
    },
    users: [{ id: 'usr_jane', access: 'member' }],
    subtasks: [{ id: 'sub_1' }, { id: 'sub_2' }],
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('task_abc')
    expect(result.externalId).toBe('task_abc')
  })

  it('maps projectId from raw.projectId when no arg given', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('proj_xyz')
  })

  it('caller-supplied projectId overrides raw.projectId', () => {
    const result = transformTask(raw, 'proj_override')
    expect(result.projectId).toBe('proj_override')
  })

  it('maps title from raw.name', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Implement login flow')
  })

  it('maps description from raw.message', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Build the login screen per Figma spec.')
  })

  it('maps parentId from raw.parentTaskId', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBe('task_parent')
  })

  it('status is open when systemStatus is open', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('status is closed when raw.systemStatus is closed', () => {
    const result = transformTask({ ...raw, systemStatus: 'closed' })
    expect(result.status).toBe('closed')
  })

  it('status is closed when raw.systemStatus is cancelled', () => {
    const result = transformTask({ ...raw, systemStatus: 'cancelled' })
    expect(result.status).toBe('closed')
  })

  it('status is closed when raw.systemStatus is canceled (single l)', () => {
    const result = transformTask({ ...raw, systemStatus: 'canceled' })
    expect(result.status).toBe('closed')
  })

  it('status falls back to raw.status.systemStatus when raw.systemStatus is absent', () => {
    const result = transformTask({
      ...raw,
      systemStatus: null,
      status: { id: 'status_2', name: 'Done', systemStatus: 'closed' },
    })
    expect(result.status).toBe('closed')
  })

  it('status is open when both systemStatus paths are absent', () => {
    const result = transformTask({ id: 'task_1', systemStatus: null, status: null })
    expect(result.status).toBe('open')
  })

  it('priority 4 maps to urgent', () => {
    const result = transformTask({ ...raw, priority: 4 })
    expect(result.priority).toBe('urgent')
  })

  it('priority 3 maps to high', () => {
    const result = transformTask({ ...raw, priority: 3 })
    expect(result.priority).toBe('high')
  })

  it('priority 2 maps to medium', () => {
    const result = transformTask({ ...raw, priority: 2 })
    expect(result.priority).toBe('medium')
  })

  it('priority 1 maps to low', () => {
    const result = transformTask({ ...raw, priority: 1 })
    expect(result.priority).toBe('low')
  })

  it('priority 0 maps to undefined', () => {
    const result = transformTask({ ...raw, priority: 0 })
    expect(result.priority).toBeUndefined()
  })

  it('absent priority maps to undefined', () => {
    const result = transformTask({ ...raw, priority: null })
    expect(result.priority).toBeUndefined()
  })

  it('dueDate prefers deadline over endDate', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe(new Date(1710000000000).toISOString())
  })

  it('dueDate falls back to endDate when deadline is absent', () => {
    const result = transformTask({ ...raw, deadline: null })
    expect(result.dueDate).toBe(new Date(1705000000000).toISOString())
  })

  it('assigneeIds contains single assignedToUserId', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['usr_jane'])
  })

  it('assigneeIds is empty when assignedToUserId is absent', () => {
    const result = transformTask({ ...raw, assignedToUserId: null })
    expect(result.assigneeIds).toEqual([])
  })

  it('tagIds is always an empty array', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual([])
  })

  it('subtaskCount reflects length of subtasks array', () => {
    const result = transformTask(raw)
    expect(result.subtaskCount).toBe(2)
  })

  it('subtaskCount is undefined when subtasks is absent', () => {
    const result = transformTask({ ...raw, subtasks: null })
    expect(result.subtaskCount).toBeUndefined()
  })

  it('subtaskCount is 0 for empty subtasks array', () => {
    const result = transformTask({ ...raw, subtasks: [] })
    expect(result.subtaskCount).toBe(0)
  })

  it('createdAt converts epoch ms from momentCreated', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBe(new Date(1699000000000).toISOString())
  })

  it('updatedAt converts epoch ms from recentActivityMoment', () => {
    const result = transformTask(raw)
    expect(result.updatedAt).toBe(new Date(1711000000000).toISOString())
  })

  it('platform is goodday', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('goodday')
  })

  it('metadata.shortId reflects raw.shortId', () => {
    const result = transformTask(raw)
    expect(result.metadata['shortId']).toBe('T-42')
  })

  it('metadata.taskTypeId reflects raw.taskType.id', () => {
    const result = transformTask(raw)
    expect(result.metadata['taskTypeId']).toBe('type_1')
  })

  it('metadata.taskTypeName reflects raw.taskType.name', () => {
    const result = transformTask(raw)
    expect(result.metadata['taskTypeName']).toBe('Feature')
  })

  it('metadata.createdByUserId reflects raw.createdByUserId', () => {
    const result = transformTask(raw)
    expect(result.metadata['createdByUserId']).toBe('usr_admin')
  })

  it('metadata.statusId reflects raw.status.id', () => {
    const result = transformTask(raw)
    expect(result.metadata['statusId']).toBe('status_1')
  })

  it('metadata.statusName reflects raw.status.name', () => {
    const result = transformTask(raw)
    expect(result.metadata['statusName']).toBe('In Progress')
  })

  it('projectId is empty string when absent and no arg given', () => {
    const result = transformTask({ id: 'task_bare' })
    expect(result.projectId).toBe('')
  })

  it('passes TaskSchema.parse with full raw', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it('passes TaskSchema.parse with minimal raw', () => {
    const result = transformTask({ id: 'task_min' })
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
