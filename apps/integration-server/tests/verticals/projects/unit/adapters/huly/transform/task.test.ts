/**
 * Fixture fields follow the documented interfaces (Huly publishes no example
 * response): tracker `Issue` and task `Task` (hcengineering/platform
 * plugins/tracker, plugins/task) over core `Doc`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformIssue,
  transformTask,
  type RawHulyIssue,
} from '../../../../../../../src/verticals/projects/adapters/huly/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

function makeRaw(overrides: Partial<RawHulyIssue> = {}): RawHulyIssue {
  return {
    _id: 'issue-abc123',
    _class: 'tracker:class:Issue',
    space: 'project-1',
    attachedTo: 'issue-parent1',
    identifier: 'HULY-42',
    number: 42,
    title: 'Fix login bug',
    description: 'blob-ref-1',
    status: 'tracker:status:Todo',
    priority: 2,
    assignee: 'person-1',
    dueDate: 1700100000000,
    subIssues: 3,
    createdOn: 1700000000000,
    modifiedOn: 1700000100000,
    ...overrides,
  }
}

describe('transformIssue', () => {
  it('parses against TaskSchema', () => {
    const t = TaskSchema.parse(transformIssue(makeRaw()))
    expect(t).toMatchObject({
      id: 'issue-abc123',
      externalId: 'issue-abc123',
      projectId: 'project-1',
      parentId: 'issue-parent1',
      title: 'Fix login bug',
      status: 'unknown',
      priority: 'high',
      dueDate: '2023-11-16T02:00:00.000Z',
      assigneeIds: ['person-1'],
      tagIds: [],
      subtaskCount: 3,
      createdAt: '2023-11-14T22:13:20.000Z',
      updatedAt: '2023-11-14T22:15:00.000Z',
      platform: 'huly',
      metadata: {
        identifier: 'HULY-42',
        statusRef: 'tracker:status:Todo',
        platformType: 'sub-issue',
      },
    })
  })

  it('does not treat the description blob reference as text', () => {
    expect(TaskSchema.parse(transformIssue(makeRaw())).description).toBeUndefined()
  })

  it('a top-level issue (attachedTo tracker:ids:NoParent) has no parentId', () => {
    const t = TaskSchema.parse(transformIssue(makeRaw({ attachedTo: 'tracker:ids:NoParent' })))
    expect(t.parentId).toBeUndefined()
    expect(t.metadata['platformType']).toBe('issue')
  })

  it.each([
    [0, undefined],
    [1, 'urgent'],
    [2, 'high'],
    [3, 'medium'],
    [4, 'low'],
  ] as const)('maps IssuePriority %i to %s', (p, want) => {
    expect(TaskSchema.parse(transformIssue(makeRaw({ priority: p }))).priority).toBe(want)
  })

  it('null assignee and dueDate map to none', () => {
    const t = TaskSchema.parse(transformIssue(makeRaw({ assignee: null, dueDate: null })))
    expect(t.assigneeIds).toEqual([])
    expect(t.dueDate).toBeUndefined()
  })

  it('transformTask is transformIssue', () => {
    expect(transformTask).toBe(transformIssue)
  })
})
