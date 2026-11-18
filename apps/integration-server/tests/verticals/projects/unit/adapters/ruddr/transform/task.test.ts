import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawRuddrProjectTask,
} from '../../../../../../../src/verticals/projects/adapters/ruddr/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('ruddr transformTask', () => {
  const baseRaw: RawRuddrProjectTask = {
    id: 'task-1',
    name: 'Write tests',
    statusId: 'not_started',
    recordStatusId: 'active',
    project: { id: 'proj-1', name: 'Acme' },
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformTask(baseRaw)
    expect(result.id).toBe('task-1')
    expect(result.externalId).toBe('task-1')
  })

  it('refuses a task without the documented name rather than titling it ""', () => {
    expect(() => transformTask({ id: 'task-x', project: { id: 'proj-1' } })).toThrow(/no name/)
  })

  it('maps title from raw.name', () => {
    const result = transformTask(baseRaw)
    expect(result.title).toBe('Write tests')
  })

  it('maps projectId from raw.project.id', () => {
    const result = transformTask(baseRaw)
    expect(result.projectId).toBe('proj-1')
  })

  it('throws when project is absent: the canonical projectId has no other documented source', () => {
    const raw: RawRuddrProjectTask = { id: 'task-2', statusId: 'not_started' }
    expect(() => transformTask(raw)).toThrow(/project/)
  })

  it('platform is ruddr', () => {
    const result = transformTask(baseRaw)
    expect(result.platform).toBe('ruddr')
  })

  // --- Status mapping ---

  it('recordStatusId="archived" maps to "closed" (takes priority over statusId)', () => {
    const raw: RawRuddrProjectTask = {
      ...baseRaw,
      recordStatusId: 'archived',
      statusId: 'in_progress',
    }
    const result = transformTask(raw)
    expect(result.status).toBe('closed')
  })

  it('statusId="not_started" maps to "open"', () => {
    const raw: RawRuddrProjectTask = {
      ...baseRaw,
      statusId: 'not_started',
      recordStatusId: 'active',
    }
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('statusId="in_progress" maps to "in_progress"', () => {
    const raw: RawRuddrProjectTask = {
      ...baseRaw,
      statusId: 'in_progress',
      recordStatusId: 'active',
    }
    const result = transformTask(raw)
    expect(result.status).toBe('in_progress')
  })

  it('statusId="completed" maps to "closed"', () => {
    const raw: RawRuddrProjectTask = { ...baseRaw, statusId: 'completed', recordStatusId: 'active' }
    const result = transformTask(raw)
    expect(result.status).toBe('closed')
  })

  it('unknown statusId maps to "unknown"', () => {
    const raw: RawRuddrProjectTask = { ...baseRaw, statusId: 'whatever', recordStatusId: 'active' }
    const result = transformTask(raw)
    expect(result.status).toBe('unknown')
  })

  it('absent statusId maps to "unknown"', () => {
    const raw: RawRuddrProjectTask = {
      id: 'task-3',
      name: 'No status',
      recordStatusId: 'active',
      project: { id: 'proj-1' },
    }
    const result = transformTask(raw)
    expect(result.status).toBe('unknown')
  })

  // --- Assignees ---

  it('assigneeIds is derived from projectMembers[].member.id', () => {
    const raw: RawRuddrProjectTask = {
      ...baseRaw,
      projectMembers: [
        { id: 'pm-1', member: { id: 'user-1', name: 'Alice' } },
        { id: 'pm-2', member: { id: 'user-2', name: 'Bob' } },
      ],
    }
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['user-1', 'user-2'])
  })

  it('assigneeIds skips entries where member is null', () => {
    const raw: RawRuddrProjectTask = {
      ...baseRaw,
      projectMembers: [
        { id: 'pm-1', member: null },
        { id: 'pm-2', member: { id: 'user-3', name: 'Carol' } },
      ],
    }
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['user-3'])
  })

  it('assigneeIds is empty array when projectMembers is absent', () => {
    const result = transformTask(baseRaw)
    expect(result.assigneeIds).toEqual([])
  })

  // --- Tags ---

  it('tagIds is derived from tags[].id', () => {
    const raw: RawRuddrProjectTask = {
      ...baseRaw,
      tags: [
        { id: 'tag-a', name: 'Backend' },
        { id: 'tag-b', name: 'Urgent' },
      ],
    }
    const result = transformTask(raw)
    expect(result.tagIds).toEqual(['tag-a', 'tag-b'])
  })

  it('tagIds is empty array when tags is absent', () => {
    const result = transformTask(baseRaw)
    expect(result.tagIds).toEqual([])
  })

  // --- Priority ---

  it('priority is always undefined (Ruddr tasks have no priority field)', () => {
    const result = transformTask(baseRaw)
    expect(result.priority).toBeUndefined()
  })

  // --- Optional fields ---

  it('parentId is mapped from raw.parent.id', () => {
    const raw: RawRuddrProjectTask = {
      ...baseRaw,
      parent: { id: 'task-parent', name: 'Parent Task' },
    }
    const result = transformTask(raw)
    expect(result.parentId).toBe('task-parent')
  })

  it('parentId is undefined when parent is absent', () => {
    const result = transformTask(baseRaw)
    expect(result.parentId).toBeUndefined()
  })

  it('dueDate is mapped from raw.end', () => {
    const raw: RawRuddrProjectTask = { ...baseRaw, end: '2026-06-30T00:00:00Z' }
    const result = transformTask(raw)
    expect(result.dueDate).toBe(new Date('2026-06-30T00:00:00Z').toISOString())
  })

  it('dueDate is undefined when raw.end is absent', () => {
    const result = transformTask(baseRaw)
    expect(result.dueDate).toBeUndefined()
  })

  it('description is mapped from raw.notes', () => {
    const raw: RawRuddrProjectTask = { ...baseRaw, notes: 'Detailed instructions here' }
    const result = transformTask(raw)
    expect(result.description).toBe('Detailed instructions here')
  })

  it('description is undefined when notes is null', () => {
    const raw: RawRuddrProjectTask = { ...baseRaw, notes: null }
    const result = transformTask(raw)
    expect(result.description).toBeUndefined()
  })

  it('createdAt is mapped from raw.createdAt', () => {
    const raw: RawRuddrProjectTask = { ...baseRaw, createdAt: '2026-01-05T12:00:00Z' }
    const result = transformTask(raw)
    expect(result.createdAt).toBe(new Date('2026-01-05T12:00:00Z').toISOString())
  })

  it('updatedAt is mapped from the documented raw.modifiedAt', () => {
    const result = transformTask({ ...baseRaw, modifiedAt: '2026-01-31T14:22:35.491Z' })
    expect(result.updatedAt).toBe('2026-01-31T14:22:35.491Z')
  })

  it('updatedAt is undefined when modifiedAt is absent', () => {
    const result = transformTask(baseRaw)
    expect(result.updatedAt).toBeUndefined()
  })

  it('subtaskCount is always undefined', () => {
    const result = transformTask(baseRaw)
    expect(result.subtaskCount).toBeUndefined()
  })

  // --- Metadata ---

  it('metadata includes code and isBillable as strings', () => {
    const raw: RawRuddrProjectTask = { ...baseRaw, code: 'T-001', isBillable: false }
    const result = transformTask(raw)
    expect(result.metadata.code).toBe('T-001')
    expect(result.metadata.isBillable).toBe('false')
  })

  it('metadata includes budgetedHours as string', () => {
    const raw: RawRuddrProjectTask = { ...baseRaw, budgetedHours: 40 }
    const result = transformTask(raw)
    expect(result.metadata.budgetedHours).toBe('40')
  })

  it('metadata includes taskCategory fields', () => {
    const raw: RawRuddrProjectTask = {
      ...baseRaw,
      taskCategory: { id: 'cat-1', name: 'Design', type: 'creative' },
    }
    const result = transformTask(raw)
    expect(result.metadata.taskCategoryId).toBe('cat-1')
    expect(result.metadata.taskCategoryName).toBe('Design')
    expect(result.metadata.taskCategoryType).toBe('creative')
  })

  it('metadata includes recordStatusId', () => {
    const result = transformTask({ ...baseRaw, recordStatusId: 'active' })
    expect(result.metadata.recordStatusId).toBe('active')
  })

  it('metadata omits null / undefined values', () => {
    const result = transformTask(baseRaw)
    expect(Object.keys(result.metadata)).not.toContain('code')
    expect(Object.keys(result.metadata)).not.toContain('budgetedHours')
  })

  // --- Schema validation ---

  it('passes TaskSchema.parse with full fixture', () => {
    const raw: RawRuddrProjectTask = {
      id: 'task-full',
      name: 'Full Fixture Task',
      statusId: 'in_progress',
      recordStatusId: 'active',
      project: { id: 'proj-1', name: 'Acme' },
      end: '2026-06-30T00:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
      isBillable: true,
      code: 'T-FULL',
      budgetedHours: 20,
      projectMembers: [{ id: 'pm-1', member: { id: 'user-1', name: 'Alice' } }],
      tags: [{ id: 'tag-x', name: 'Backend' }],
      taskCategory: { id: 'cat-1', name: 'Dev', type: 'technical' },
    }
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it('passes TaskSchema.parse with minimal fixture', () => {
    const result = transformTask({ id: 'task-min', name: 'Minimal', project: { id: 'proj-min' } })
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it('maps the documented GET /tasks example row (docs.ruddr.io/api-reference/tasks/list-tasks)', () => {
    const raw: RawRuddrProjectTask = {
      id: 'a3f8c214-7b92-4e61-9d05-1c83e6f2a047',
      name: 'Backend API Integration',
      notes: 'Implement REST endpoints for the client portal module.',
      order: 16384,
      position: 16384,
      statusId: 'in_progress',
      start: '2026-02-01',
      end: '2026-03-31',
      isBillable: true,
      lockTime: false,
      capHours: true,
      capAssignedHours: false,
      code: 'DEV-042',
      forAssignedOnly: false,
      requireNotes: false,
      recordStatusId: 'active',
      budgetedHours: 120.5,
      budgetedServicesRevenue: 18075,
      createdAt: '2026-01-10T14:22:35.491Z',
      modifiedAt: '2026-01-31T14:22:35.491Z',
      project: {
        id: 'f52e9a17-3c64-4b88-a701-8d94bc2f5e63',
        name: 'Acme Portal Redesign',
        client: { id: '2b7d8e41-9f53-4a26-b8c2-6e1f5d3a9074', name: 'Acme Company, Inc.' },
      },
      parent: { id: '7d1b4f93-2a85-4c70-8e16-5b29d4c7e831', name: 'Phase 2 Development' },
      roles: [
        { id: '0e011217-4925-4931-b2ee-257da8d9f0fe', name: 'Senior Developer', hours: 80 },
        { id: 'c4a9f312-8b57-4d93-a625-1e7f2b8d4c06', name: 'QA Engineer', hours: 40.5 },
      ],
      projectMembers: [
        {
          id: '5c2d9f84-1b67-4e38-a915-7d3c8e2f6a41',
          member: { id: 'b8f4e293-6d17-4a85-9c42-3e7f1d5b2a68', name: 'Jordan Rivera' },
          hours: null,
        },
      ],
      tags: [
        { id: '91b3e724-5f18-4a92-8c37-2d6e4f1b5a89', name: 'Backend' },
        { id: '3e8f1d62-7a45-4b19-9c28-6f2e5d4a3b17', name: 'High Priority' },
      ],
      taskCategory: {
        id: 'c7e2f4a1-9b38-4d65-8c17-3a5f1e2d4b96',
        name: 'Standard Task',
        type: 'standard',
      },
      predecessors: [
        { id: '8d3a1f56-2c94-4e07-b815-6f2d9a4c7e30', name: 'Database Schema Design' },
      ],
      successors: [{ id: '4b9e2d71-5a38-4c16-9f02-7e1c8d3b5a64', name: 'Client Portal Launch' }],
    }
    const task = TaskSchema.parse(transformTask(raw))
    expect(task).toMatchObject({
      id: 'a3f8c214-7b92-4e61-9d05-1c83e6f2a047',
      projectId: 'f52e9a17-3c64-4b88-a701-8d94bc2f5e63',
      parentId: '7d1b4f93-2a85-4c70-8e16-5b29d4c7e831',
      title: 'Backend API Integration',
      description: 'Implement REST endpoints for the client portal module.',
      status: 'in_progress',
      dueDate: '2026-03-31T00:00:00.000Z',
      assigneeIds: ['b8f4e293-6d17-4a85-9c42-3e7f1d5b2a68'],
      tagIds: ['91b3e724-5f18-4a92-8c37-2d6e4f1b5a89', '3e8f1d62-7a45-4b19-9c28-6f2e5d4a3b17'],
      createdAt: '2026-01-10T14:22:35.491Z',
      updatedAt: '2026-01-31T14:22:35.491Z',
      platform: 'ruddr',
    })
    expect(task.metadata).toMatchObject({ code: 'DEV-042', taskCategoryType: 'standard' })
  })
})
