import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawNuclinoItem,
} from '../../../../../../../src/verticals/projects/adapters/nuclino/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

function makeItem(overrides: Partial<RawNuclinoItem> = {}): RawNuclinoItem {
  return {
    object: 'item',
    id: 'item-nuclino-1',
    workspaceId: 'ws-nuclino-1',
    url: 'https://app.nuclino.com/t/item-nuclino-1',
    title: 'API Design Guidelines',
    createdAt: '2024-02-01T09:00:00.000Z',
    createdUserId: 'usr-jane',
    lastUpdatedAt: '2024-02-20T15:00:00.000Z',
    lastUpdatedUserId: 'usr-bob',
    content: 'Document describing API conventions.',
    ...overrides,
  }
}

describe('nuclino transformTask', () => {
  it('maps id and externalId from raw.id', () => {
    const result = transformTask(makeItem())
    expect(result.id).toBe('item-nuclino-1')
    expect(result.externalId).toBe('item-nuclino-1')
  })

  it('maps projectId from explicit arg', () => {
    const result = transformTask(makeItem(), 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('falls back to raw.workspaceId for projectId', () => {
    const result = transformTask(makeItem())
    expect(result.projectId).toBe('ws-nuclino-1')
  })

  it('maps title from raw.title', () => {
    const result = transformTask(makeItem())
    expect(result.title).toBe('API Design Guidelines')
  })

  it('maps description from raw.content', () => {
    const result = transformTask(makeItem())
    expect(result.description).toBe('Document describing API conventions.')
  })

  it('status is always open', () => {
    const result = transformTask(makeItem())
    expect(result.status).toBe('open')
  })

  it('assigneeIds contains createdUserId when present', () => {
    const result = transformTask(makeItem())
    expect(result.assigneeIds).toEqual(['usr-jane'])
  })

  it('assigneeIds is empty when createdUserId is absent', () => {
    const result = transformTask(makeItem({ createdUserId: undefined }))
    expect(result.assigneeIds).toEqual([])
  })

  it('tagIds is always empty', () => {
    const result = transformTask(makeItem())
    expect(result.tagIds).toEqual([])
  })

  it('subtaskCount is undefined for item objects', () => {
    const result = transformTask(makeItem({ object: 'item' }))
    expect(result.subtaskCount).toBeUndefined()
  })

  it('subtaskCount is childIds.length for collection objects', () => {
    const result = transformTask(makeItem({ object: 'collection', childIds: ['c1', 'c2', 'c3'] }))
    expect(result.subtaskCount).toBe(3)
  })

  it('subtaskCount is 0 for empty collection', () => {
    const result = transformTask(makeItem({ object: 'collection', childIds: [] }))
    expect(result.subtaskCount).toBe(0)
  })

  it('maps createdAt from raw.createdAt', () => {
    const result = transformTask(makeItem())
    expect(result.createdAt).toBe('2024-02-01T09:00:00.000Z')
  })

  it('maps updatedAt from raw.lastUpdatedAt', () => {
    const result = transformTask(makeItem())
    expect(result.updatedAt).toBe('2024-02-20T15:00:00.000Z')
  })

  it('platform is nuclino', () => {
    const result = transformTask(makeItem())
    expect(result.platform).toBe('nuclino')
  })

  it('metadata.objectType reflects raw.object', () => {
    const result = transformTask(makeItem())
    expect(result.metadata.objectType).toBe('item')
  })

  it('metadata.url reflects raw.url', () => {
    const result = transformTask(makeItem())
    expect(result.metadata.url).toBe('https://app.nuclino.com/t/item-nuclino-1')
  })

  it('metadata.lastUpdatedUserId reflects raw.lastUpdatedUserId', () => {
    const result = transformTask(makeItem())
    expect(result.metadata.lastUpdatedUserId).toBe('usr-bob')
  })

  it('priority is always undefined', () => {
    const result = transformTask(makeItem())
    expect(result.priority).toBeUndefined()
  })

  it('passes TaskSchema.parse without throwing', () => {
    const result = transformTask(makeItem())
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
