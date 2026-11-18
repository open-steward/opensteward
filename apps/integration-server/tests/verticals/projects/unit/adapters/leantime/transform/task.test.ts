import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawLeantimeTicket,
} from '../../../../../../../src/verticals/projects/adapters/leantime/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('leantime transformTicket', () => {
  const raw: RawLeantimeTicket = {
    id: 88,
    headline: 'Implement OAuth',
    description: 'Add OAuth2 login flow',
    type: 'task',
    projectId: 7,
    editorId: 5,
    userId: 3,
    priority: 2,
    status: 0,
    statusLabel: 'open',
    date: '2024-05-01T09:00:00.000Z',
    dateToFinish: '2024-07-01T00:00:00.000Z',
    modified: '2024-06-15T12:00:00.000Z',
    milestoneid: 10,
    tags: 'auth, backend',
    storypoints: 5,
    planHours: 8,
    hourRemaining: 4,
  }

  it('maps id as string', () => {
    const result = transformTicket(raw)
    expect(result.id).toBe('88')
    expect(result.externalId).toBe('88')
  })

  it('maps headline to title', () => {
    const result = transformTicket(raw)
    expect(result.title).toBe('Implement OAuth')
  })

  it('maps projectId from projectId field', () => {
    const result = transformTicket(raw)
    expect(result.projectId).toBe('7')
  })

  it('overrides projectId with explicit argument', () => {
    const result = transformTicket(raw, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('maps editorId to assigneeIds', () => {
    const result = transformTicket(raw)
    expect(result.assigneeIds).toEqual(['5'])
  })

  it('assigneeIds is empty when editorId absent', () => {
    const result = transformTicket({ ...raw, editorId: undefined })
    expect(result.assigneeIds).toEqual([])
  })

  it('maps milestoneid to parentId', () => {
    const result = transformTicket(raw)
    expect(result.parentId).toBe('10')
  })

  it('parentId is undefined when milestoneid absent', () => {
    const result = transformTicket({ ...raw, milestoneid: undefined })
    expect(result.parentId).toBeUndefined()
  })

  it('status is open for status=0 and statusLabel=open', () => {
    const result = transformTicket(raw)
    expect(result.status).toBe('open')
  })

  it('status is closed when statusLabel=done', () => {
    const result = transformTicket({ ...raw, statusLabel: 'done' })
    expect(result.status).toBe('closed')
  })

  it('status is closed when status >= 98', () => {
    const result = transformTicket({ ...raw, status: 98, statusLabel: '' })
    expect(result.status).toBe('closed')
  })

  it('status is in_progress when statusLabel=in progress', () => {
    const result = transformTicket({ ...raw, statusLabel: 'in progress' })
    expect(result.status).toBe('in_progress')
  })

  it('status is in_review when statusLabel=review', () => {
    const result = transformTicket({ ...raw, statusLabel: 'review' })
    expect(result.status).toBe('in_review')
  })

  it('priority=2 maps to high', () => {
    const result = transformTicket(raw)
    expect(result.priority).toBe('high')
  })

  it('priority=3 maps to urgent', () => {
    const result = transformTicket({ ...raw, priority: 3 })
    expect(result.priority).toBe('urgent')
  })

  it('priority=1 maps to low', () => {
    const result = transformTicket({ ...raw, priority: 1 })
    expect(result.priority).toBe('low')
  })

  it('priority=0 maps to medium', () => {
    const result = transformTicket({ ...raw, priority: 0 })
    expect(result.priority).toBe('medium')
  })

  it('maps dueDate from dateToFinish', () => {
    const result = transformTicket(raw)
    expect(result.dueDate).toBe('2024-07-01T00:00:00.000Z')
  })

  it('maps createdAt from date and updatedAt from modified', () => {
    const result = transformTicket(raw)
    expect(result.createdAt).toBe('2024-05-01T09:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-15T12:00:00.000Z')
  })

  it('tagIds is always empty (tags field is raw string)', () => {
    const result = transformTicket(raw)
    expect(result.tagIds).toEqual([])
  })

  it('platform is leantime', () => {
    const result = transformTicket(raw)
    expect(result.platform).toBe('leantime')
  })

  it('metadata contains type, tags, storypoints', () => {
    const result = transformTicket(raw)
    expect(result.metadata.type).toBe('task')
    expect(result.metadata.tags).toBe('auth, backend')
    expect(result.metadata.storypoints).toBe('5')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTicket(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
