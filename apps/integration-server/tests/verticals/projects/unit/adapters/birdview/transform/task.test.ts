/**
 * Fixture fields are the TaskModel / TaskStatus properties declared in
 * https://app.go.easyprojects.net/api/swagger/v2/swagger.json.
 */
import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawBirdviewTask,
  type RawBirdviewTaskStatus,
} from '../../../../../../../src/verticals/projects/adapters/birdview/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

const raw: RawBirdviewTask = {
  TaskId: 456,
  Name: 'Design mockups',
  Description: '<p>Create high-fidelity mockups</p>',
  PlainTextDescription: null,
  Progress: 10,
  ParentId: 400,
  ProjectId: 123,
  TaskStatusId: 7,
  SpaceId: 9,
  PriorityId: 3,
  CreatorId: 77,
  CategoryId: null,
  TaskTypeId: 1,
  CreationDate: '2025-02-01T09:00:00Z',
  StartDate: '2025-02-10T00:00:00Z',
  EndDate: '2025-03-01T00:00:00Z',
  ActualCompletionDate: null,
  LastModificationDate: '2025-02-15T12:00:00Z',
  EstimatedHours: 8,
  HoursLeft: 6,
  IsMilestone: false,
  HasChild: false,
  Billed: false,
  BillingType: 0,
  WBSNumber: 1,
}

const status = (over: Partial<RawBirdviewTaskStatus> = {}): RawBirdviewTaskStatus => ({
  TaskStatusId: 7,
  Name: 'In work',
  WorkflowId: 1,
  TreatAsCompleted: false,
  TreatAsHold: false,
  TreatAsInactive: false,
  TaskTypeId: 1,
  ...over,
})

describe('birdview transformTask', () => {
  it('maps the documented TaskModel fields and passes TaskSchema', () => {
    const t = TaskSchema.parse(transformTask(raw, ['77', '88'], status()))
    expect(t).toMatchObject({
      id: '456',
      externalId: '456',
      projectId: '123',
      parentId: '400',
      title: 'Design mockups',
      description: '<p>Create high-fidelity mockups</p>',
      status: 'open',
      dueDate: '2025-03-01T00:00:00.000Z',
      assigneeIds: ['77', '88'],
      tagIds: [],
      createdAt: '2025-02-01T09:00:00.000Z',
      updatedAt: '2025-02-15T12:00:00.000Z',
      platform: 'birdview',
    })
    expect(t.priority).toBeUndefined()
    expect(t.metadata).toEqual({
      taskStatusId: '7',
      statusName: 'In work',
      priorityId: '3',
      taskTypeId: '1',
      startDate: '2025-02-10T00:00:00Z',
    })
  })

  it('status comes from the status row flags', () => {
    expect(
      TaskSchema.parse(transformTask(raw, [], status({ TreatAsCompleted: true }))).status,
    ).toBe('closed')
    expect(TaskSchema.parse(transformTask(raw, [], status({ TreatAsHold: true }))).status).toBe(
      'unknown',
    )
    expect(TaskSchema.parse(transformTask(raw, [], status({ TreatAsInactive: true }))).status).toBe(
      'unknown',
    )
    expect(TaskSchema.parse(transformTask(raw, [], undefined)).status).toBe('unknown')
  })

  it('a root task has no parentId', () => {
    expect(
      TaskSchema.parse(transformTask({ ...raw, ParentId: null }, [], status())).parentId,
    ).toBeUndefined()
  })

  it('reads TaskId, never Id', () => {
    const noId = { ...raw } as Record<string, unknown>
    delete noId['TaskId']
    expect(() => transformTask(noId as unknown as RawBirdviewTask, [], status())).toThrow(/TaskId/)
  })
})
