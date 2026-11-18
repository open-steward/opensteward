import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawFavroCard,
} from '../../../../../../../src/verticals/projects/adapters/favro/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('favro transformTask', () => {
  const raw: RawFavroCard = {
    cardId: 'card-local-1',
    cardCommonId: 'card-common-99',
    organizationId: 'org-xyz',
    widgetCommonId: 'widget-abc',
    columnId: 'col-doing',
    laneId: 'lane-1',
    parentCardId: null,
    name: 'Implement OAuth flow',
    detailedDescription: 'Add OAuth 2.0 support for the API.',
    tags: ['tag-security', 'tag-api'],
    sequentialId: 42,
    dueDate: '2024-05-01T00:00:00.000Z',
    assignments: [
      { userId: 'user-alice', completed: false },
      { userId: 'user-bob', completed: false },
    ],
    numComments: 3,
    tasksTotal: 5,
    tasksDone: 2,
    archived: false,
  }

  it('id and externalId use cardCommonId when present', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('card-common-99')
    expect(result.externalId).toBe('card-common-99')
  })

  it('id falls back to cardId when cardCommonId is absent', () => {
    const result = transformTask({ ...raw, cardCommonId: undefined })
    expect(result.id).toBe('card-local-1')
  })

  it('maps projectId from caller arg', () => {
    const result = transformTask(raw, 'widget-override')
    expect(result.projectId).toBe('widget-override')
  })

  it('maps projectId from widgetCommonId when no arg supplied', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('widget-abc')
  })

  it('maps title from name', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Implement OAuth flow')
  })

  it('maps description from detailedDescription', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Add OAuth 2.0 support for the API.')
  })

  it('status is open when not all assignees are completed', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('status is closed when all assignees are completed', () => {
    const result = transformTask({
      ...raw,
      assignments: [
        { userId: 'user-alice', completed: true },
        { userId: 'user-bob', completed: true },
      ],
    })
    expect(result.status).toBe('closed')
  })

  it('status is open when assignments array is empty', () => {
    const result = transformTask({ ...raw, assignments: [] })
    expect(result.status).toBe('open')
  })

  it('priority is always undefined (no priority on Favro cards)', () => {
    const result = transformTask(raw)
    expect(result.priority).toBeUndefined()
  })

  it('parentId is undefined when parentCardId is null', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('parentId is set when parentCardId is a string', () => {
    const result = transformTask({ ...raw, parentCardId: 'parent-card-5' })
    expect(result.parentId).toBe('parent-card-5')
  })

  it('assigneeIds maps from assignments array', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['user-alice', 'user-bob'])
  })

  it('tagIds maps from tags array', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual(['tag-security', 'tag-api'])
  })

  it('dueDate parses from dueDate field', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2024-05-01T00:00:00.000Z')
  })

  it('subtaskCount reflects tasksTotal', () => {
    const result = transformTask(raw)
    expect(result.subtaskCount).toBe(5)
  })

  it('createdAt and updatedAt are always undefined (not on card object)', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('platform is favro', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('favro')
  })

  it('metadata.platformType is card for top-level card', () => {
    const result = transformTask(raw)
    expect(result.metadata.platformType).toBe('card')
  })

  it('metadata.platformType is subtask when parentCardId is set', () => {
    const result = transformTask({ ...raw, parentCardId: 'parent-5' })
    expect(result.metadata.platformType).toBe('subtask')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
