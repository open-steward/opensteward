import { describe, it, expect } from 'vitest'
import {
  transformCard,
  type RawNextcloudDeckCard,
} from '../../../../../../../src/verticals/projects/adapters/nextcloud-deck/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('nextcloud-deck transformCard', () => {
  const raw: RawNextcloudDeckCard = {
    id: 500,
    title: 'Fix login bug',
    description: 'Steps: open app, tap login.',
    duedate: '2026-06-15T00:00:00.000Z',
    archived: false,
    done: null,
    stackId: 10,
    boardId: 12,
    order: 1,
    type: 'plain',
    lastModified: 1746057600, // 2026-05-01T00:00:00Z
    createdAt: 1745971200, // 2026-04-30T00:00:00Z
    assignedUsers: [{ id: 1, participant: { uid: 'jdoe', displayname: 'Jane Doe', type: 0 } }],
    labels: [
      { id: 77, title: 'Bug', color: 'ff0000', boardId: 12 },
      { id: 88, title: 'Urgent', color: 'ff6600', boardId: 12 },
    ],
    attachmentCount: 2,
    commentsUnread: 0,
  }

  it('id is compound boardId/stackId/cardId', () => {
    const result = transformCard(raw)
    expect(result.id).toBe('12/10/500')
  })

  it('externalId is the bare card id', () => {
    const result = transformCard(raw)
    expect(result.externalId).toBe('500')
  })

  it('projectId derives from boardId when no projectId arg supplied', () => {
    const result = transformCard(raw)
    expect(result.projectId).toBe('12')
  })

  it('caller-supplied projectId is used as-is', () => {
    const result = transformCard(raw, 'board-override')
    expect(result.projectId).toBe('board-override')
  })

  it('maps title from title', () => {
    const result = transformCard(raw)
    expect(result.title).toBe('Fix login bug')
  })

  it('maps description', () => {
    const result = transformCard(raw)
    expect(result.description).toBe('Steps: open app, tap login.')
  })

  it('status is open when not archived and not done', () => {
    const result = transformCard(raw)
    expect(result.status).toBe('open')
  })

  it('status is closed when archived is true', () => {
    const result = transformCard({ ...raw, archived: true })
    expect(result.status).toBe('closed')
  })

  it('status is closed when done is truthy string', () => {
    const result = transformCard({ ...raw, done: '2026-06-01T00:00:00.000Z' })
    expect(result.status).toBe('closed')
  })

  it('dueDate is ISO string from duedate', () => {
    const result = transformCard(raw)
    expect(result.dueDate).toBe('2026-06-15T00:00:00.000Z')
  })

  it('assigneeIds are compound boardId/uid', () => {
    const result = transformCard(raw)
    expect(result.assigneeIds).toEqual(['12/jdoe'])
  })

  it('assigneeIds is empty when no assignedUsers', () => {
    const result = transformCard({ ...raw, assignedUsers: [] })
    expect(result.assigneeIds).toEqual([])
  })

  it('tagIds are compound boardId/labelId', () => {
    const result = transformCard(raw)
    expect(result.tagIds).toEqual(['12/77', '12/88'])
  })

  it('createdAt comes from createdAt Unix timestamp', () => {
    const result = transformCard(raw)
    expect(result.createdAt).toBe(new Date(1745971200 * 1000).toISOString())
  })

  it('updatedAt comes from lastModified Unix timestamp', () => {
    const result = transformCard(raw)
    expect(result.updatedAt).toBe(new Date(1746057600 * 1000).toISOString())
  })

  it('platform is nextcloud-deck', () => {
    const result = transformCard(raw)
    expect(result.platform).toBe('nextcloud-deck')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformCard(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it('handles minimal raw object gracefully', () => {
    // When boardId is absent, projectId arg is used as boardId in compound id
    const result = transformCard({ id: 1 }, 'proj-1')
    expect(result.id).toBe('proj-1//1') // boardId=proj-1, stackId='', cardId='1'
    expect(result.status).toBe('open')
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
