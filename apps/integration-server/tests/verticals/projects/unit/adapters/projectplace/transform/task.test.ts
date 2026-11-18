import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawProjectplaceCard,
} from '../../../../../../../src/verticals/projects/adapters/projectplace/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('projectplace transformTask (card)', () => {
  const raw: RawProjectplaceCard = {
    id: 8888,
    title: 'Design new login page',
    description: 'UX redesign of the login page with SSO support.',
    due_date: '2025-09-30',
    start_date: '2025-07-01',
    is_done: false,
    board_id: 200,
    planlet_id: 50,
    project_id: 100,
    assignee: { id: 77, name: 'Ivy Designer' },
    label: { id: 12, name: 'UX' },
    comment_count: 3,
    created_time: 1746057600, // 2025-05-01T00:00:00.000Z
    modified_time: 1748736000, // 2025-06-01T00:00:00.000Z
  }

  it('maps id as string', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('8888')
    expect(result.externalId).toBe('8888')
  })

  it('maps title correctly', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Design new login page')
  })

  it('maps description correctly', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('UX redesign of the login page with SSO support.')
  })

  it('status is open when is_done=false', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('status is closed when is_done=true', () => {
    const result = transformTask({ ...raw, is_done: true })
    expect(result.status).toBe('closed')
  })

  it('status is closed when done=true', () => {
    const result = transformTask({ ...raw, is_done: false, done: true })
    expect(result.status).toBe('closed')
  })

  it('projectId comes from explicit argument', () => {
    const result = transformTask(raw, 'explicit-proj')
    expect(result.projectId).toBe('explicit-proj')
  })

  it('projectId falls back to raw.project_id', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('100')
  })

  it('parentId comes from planlet_id as string', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBe('50')
  })

  it('dueDate from due_date (calendar date string)', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe(new Date('2025-09-30').toISOString())
  })

  it('assigneeIds includes assignee.id as string', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['77'])
  })

  it('falls back to assignee_id when assignee object absent', () => {
    const result = transformTask({ ...raw, assignee: null, assignee_id: 88 })
    expect(result.assigneeIds).toEqual(['88'])
  })

  it('tagIds includes label.id as string', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual(['12'])
  })

  it('falls back to label_id when label object absent', () => {
    const result = transformTask({ ...raw, label: null, label_id: 99 })
    expect(result.tagIds).toEqual(['99'])
  })

  it('createdAt converts epoch seconds', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBe(new Date(1746057600 * 1000).toISOString())
  })

  it('updatedAt converts epoch seconds', () => {
    const result = transformTask(raw)
    expect(result.updatedAt).toBe(new Date(1748736000 * 1000).toISOString())
  })

  it('platform is projectplace', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('projectplace')
  })

  it('metadata includes platformType=card and boardId', () => {
    const result = transformTask(raw)
    expect(result.metadata.platformType).toBe('card')
    expect(result.metadata.boardId).toBe('200')
  })

  it('metadata includes commentCount', () => {
    const result = transformTask(raw)
    expect(result.metadata.commentCount).toBe('3')
  })

  it('metadata includes labelName', () => {
    const result = transformTask(raw)
    expect(result.metadata.labelName).toBe('UX')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw, 'proj-1')
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
