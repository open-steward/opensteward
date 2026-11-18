import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawZohoSprintsActivity,
} from '../../../../../../../src/verticals/projects/adapters/zoho-sprints/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('zoho-sprints transformComment', () => {
  const raw: RawZohoSprintsActivity = {
    activityId: 'act-111',
    description: 'This task is blocked.',
    addedBy: 'zpuid-42',
    addedTime: 1704067200000,
    type: 'comment',
    itemId: 'item-99',
    projId: 'proj-77',
    sprintId: 'sprint-3',
  }

  it('maps id and externalId from activityId', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('act-111')
    expect(result.externalId).toBe('act-111')
  })

  it('maps body from description', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('This task is blocked.')
  })

  it('maps authorId from addedBy', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('zpuid-42')
  })

  it('maps taskId from itemId when no arg supplied', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('item-99')
  })

  it('caller-supplied taskId takes precedence over itemId', () => {
    const result = transformComment(raw, 'task-override')
    expect(result.taskId).toBe('task-override')
  })

  it('maps projectId from projId when no arg supplied', () => {
    const result = transformComment(raw)
    expect(result.projectId).toBe('proj-77')
  })

  it('caller-supplied projectId takes precedence over projId', () => {
    const result = transformComment(raw, undefined, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('converts epoch-ms number addedTime to ISO string', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('converts numeric-string addedTime to ISO string', () => {
    const result = transformComment({ ...raw, addedTime: '1704067200000' })
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('falls back to epoch-0 when addedTime is absent', () => {
    const result = transformComment({ activityId: 'x', addedBy: 'u1' })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('mentions is always []', () => {
    const result = transformComment(raw)
    expect(result.mentions).toEqual([])
  })

  it('attachmentCount is always 0', () => {
    const result = transformComment(raw)
    expect(result.attachmentCount).toBe(0)
  })

  it('platform is zoho-sprints', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('zoho-sprints')
  })

  it('metadata includes sprintId and type', () => {
    const result = transformComment(raw)
    expect(result.metadata['sprintId']).toBe('sprint-3')
    expect(result.metadata['type']).toBe('comment')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
