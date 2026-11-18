import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawZohoSprintsItem,
} from '../../../../../../../src/verticals/projects/adapters/zoho-sprints/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('zoho-sprints transformTask', () => {
  const raw: RawZohoSprintsItem = {
    itemId: 'item-200',
    itemName: 'Build login page',
    description: 'OAuth2 + SSO support.',
    statusId: 'status-1',
    statusName: 'In Progress',
    statusType: 2,
    projPriorityId: 'pri-2',
    priorityName: 'High',
    sprintId: 'sprint-3',
    projId: 'proj-77',
    ownerId: 'zpuid-42',
    startDate: 1704067200000,
    endDate: 1706745600000,
    createdTime: 1704067200000,
    lastModifiedTime: 1704153600000,
    immediateParentId: '0',
    commentCount: 5,
    points: 8,
    itemNo: 'RL-42',
    itemTypeName: 'Story',
  }

  it('maps id and externalId from itemId', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('item-200')
    expect(result.externalId).toBe('item-200')
  })

  it('maps title from itemName', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Build login page')
  })

  it('maps description', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('OAuth2 + SSO support.')
  })

  it('maps projectId from projId when no arg supplied', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('proj-77')
  })

  it('caller-supplied projectId takes precedence over projId', () => {
    const result = transformTask(raw, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('statusName "In Progress" maps to in_progress', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('in_progress')
  })

  it('statusType 3 maps to closed regardless of statusName', () => {
    const result = transformTask({ ...raw, statusType: 3, statusName: 'Something' })
    expect(result.status).toBe('closed')
  })

  it('statusName containing "done" maps to closed', () => {
    const result = transformTask({ ...raw, statusType: undefined, statusName: 'Done' })
    expect(result.status).toBe('closed')
  })

  it('statusName containing "complete" maps to closed', () => {
    const result = transformTask({ ...raw, statusType: undefined, statusName: 'Complete' })
    expect(result.status).toBe('closed')
  })

  it('unknown statusName maps to open', () => {
    const result = transformTask({ ...raw, statusType: undefined, statusName: 'Backlog' })
    expect(result.status).toBe('open')
  })

  it('priorityName "High" maps to high', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('priorityName "Urgent" maps to urgent', () => {
    const result = transformTask({ ...raw, priorityName: 'Urgent' })
    expect(result.priority).toBe('urgent')
  })

  it('priorityName "Medium" maps to medium', () => {
    const result = transformTask({ ...raw, priorityName: 'Medium' })
    expect(result.priority).toBe('medium')
  })

  it('priorityName "Low" maps to low', () => {
    const result = transformTask({ ...raw, priorityName: 'Low' })
    expect(result.priority).toBe('low')
  })

  it('unknown priorityName yields undefined', () => {
    const result = transformTask({ ...raw, priorityName: 'Custom' })
    expect(result.priority).toBeUndefined()
  })

  it('immediateParentId "0" yields undefined parentId (top-level item)', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('non-zero immediateParentId is set as parentId', () => {
    const result = transformTask({ ...raw, immediateParentId: 'item-100' })
    expect(result.parentId).toBe('item-100')
  })

  it('falls back to parentItem when immediateParentId is absent', () => {
    const result = transformTask({ ...raw, immediateParentId: undefined, parentItem: 'item-50' })
    expect(result.parentId).toBe('item-50')
  })

  it('parentItem "0" also yields undefined parentId', () => {
    const result = transformTask({ ...raw, immediateParentId: undefined, parentItem: '0' })
    expect(result.parentId).toBeUndefined()
  })

  it('maps assigneeIds from ownerId', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['zpuid-42'])
  })

  it('falls back to zpuid when ownerId is absent', () => {
    const result = transformTask({ ...raw, ownerId: undefined, zpuid: 'zpuid-fallback' })
    expect(result.assigneeIds).toEqual(['zpuid-fallback'])
  })

  it('assigneeIds is [] when no assignee fields present', () => {
    const result = transformTask({ itemId: 'item-x', itemName: 'Task X' })
    expect(result.assigneeIds).toEqual([])
  })

  it('converts epoch-ms endDate to ISO dueDate', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2024-02-01T00:00:00.000Z')
  })

  it('converts epoch-ms createdTime and lastModifiedTime to ISO', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-01-02T00:00:00.000Z')
  })

  it('tagIds is always []', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual([])
  })

  it('subtaskCount is always undefined', () => {
    const result = transformTask(raw)
    expect(result.subtaskCount).toBeUndefined()
  })

  it('platform is zoho-sprints', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('zoho-sprints')
  })

  it('metadata includes sprintId, statusId, statusName, itemNo, itemTypeName', () => {
    const result = transformTask(raw)
    expect(result.metadata['sprintId']).toBe('sprint-3')
    expect(result.metadata['statusId']).toBe('status-1')
    expect(result.metadata['statusName']).toBe('In Progress')
    expect(result.metadata['itemNo']).toBe('RL-42')
    expect(result.metadata['itemTypeName']).toBe('Story')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
