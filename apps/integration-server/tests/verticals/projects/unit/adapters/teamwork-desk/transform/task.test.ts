/**
 * Fixtures follow the documented 200 examples of the Spaces v1 reference:
 *  - https://apidocs.teamwork.com/docs/spaces/v1/pages/get-v1-spaces-space-id-pages-page-id-json
 *    `{ "page" : { ..., "id" : 0, ..., "slug" : "string", "space" : { "id" : 0, ... },
 *      "state" : "string", "summary" : "string", "tags" : [ { "tag" : { ..., "id" : 0, ... } } ], ... } }`
 *  - https://apidocs.teamwork.com/docs/spaces/v1/space-content/get-v1-spaces-space-id-pages-json
 *    `{ "childPages" : [...], "id" : 0, "slug" : "string", "title" : "string", "updatedAt" : "..." }`
 */
import { describe, it, expect } from 'vitest'
import {
  transformTask,
  transformTreePage,
  type RawSpacesPage,
} from '../../../../../../../src/verticals/projects/adapters/teamwork-desk/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('teamwork-desk transformTask (full page)', () => {
  const raw: RawSpacesPage = {
    id: 200,
    title: 'API Reference',
    summary: 'Complete REST API documentation.',
    state: 'string',
    isPublished: true,
    isPrivate: false,
    isHomePage: false,
    isRequiredReading: true,
    parentId: 150,
    order: 1,
    slug: 'api-reference',
    meta: { timeToRead: 8, wordCount: 1200 },
    tags: [{ tag: { id: 7 } }, { tag: { id: 9 } }],
    createdAt: '2024-02-01T08:00:00.000Z',
    updatedAt: '2024-02-15T14:00:00.000Z',
    createdBy: { id: 42, type: 'users' },
    space: { id: 300, type: 'spaces' },
  }

  it('parses with TaskSchema', () => {
    expect(() => TaskSchema.parse(transformTask(raw, '300'))).not.toThrow()
  })

  it('id is the readable-back {spaceID}:{pageID}; externalId is the page id', () => {
    const t = transformTask(raw, '300')
    expect(t.id).toBe('300:200')
    expect(t.externalId).toBe('200')
    expect(t.projectId).toBe('300')
  })

  it('parentId is the composite id of the documented parentId', () => {
    expect(transformTask(raw, '300').parentId).toBe('300:150')
    expect(transformTask({ ...raw, parentId: null }, '300').parentId).toBeUndefined()
  })

  it('maps title, summary and timestamps', () => {
    const t = transformTask(raw, '300')
    expect(t.title).toBe('API Reference')
    expect(t.description).toBe('Complete REST API documentation.')
    expect(t.createdAt).toBe('2024-02-01T08:00:00.000Z')
    expect(t.updatedAt).toBe('2024-02-15T14:00:00.000Z')
  })

  it('tagIds come from the documented tags[].tag.id', () => {
    expect(transformTask(raw, '300').tagIds).toEqual(['7', '9'])
  })

  it('the author is not an assignee; it is kept in metadata', () => {
    const t = transformTask(raw, '300')
    expect(t.assigneeIds).toEqual([])
    expect(t.metadata['createdBy']).toBe('42')
  })

  it('status is closed when deletedAt is set, open otherwise; state is kept verbatim', () => {
    expect(transformTask(raw, '300').status).toBe('open')
    expect(transformTask({ ...raw, deletedAt: '2024-03-01T00:00:00.000Z' }, '300').status).toBe(
      'closed',
    )
    expect(transformTask(raw, '300').metadata['state']).toBe('string')
  })

  it('platform and slug', () => {
    const t = transformTask(raw, '300')
    expect(t.platform).toBe('teamwork-desk')
    expect(t.metadata['slug']).toBe('api-reference')
  })
})

describe('teamwork-desk transformTreePage (page-tree node)', () => {
  const node = {
    childPages: [{ id: 11, slug: 'child', title: 'Child', updatedAt: '2026-09-24T10:33:14.750Z' }],
    id: 10,
    slug: 'home',
    title: 'Home',
    updatedAt: '2026-09-24T10:33:14.750Z',
  }

  it('parses with TaskSchema', () => {
    expect(() => TaskSchema.parse(transformTreePage(node, '5', undefined, false))).not.toThrow()
    expect(() => TaskSchema.parse(transformTreePage(node, '5', '1', true))).not.toThrow()
  })

  it('maps the documented node fields only', () => {
    const t = transformTreePage(node, '5', undefined, false)
    expect(t.id).toBe('5:10')
    expect(t.externalId).toBe('10')
    expect(t.projectId).toBe('5')
    expect(t.parentId).toBeUndefined()
    expect(t.title).toBe('Home')
    expect(t.updatedAt).toBe('2026-09-24T10:33:14.750Z')
    expect(t.createdAt).toBeUndefined()
    expect(t.metadata).toEqual({ slug: 'home', isPrivate: 'false' })
  })

  it('a node carries no state, so status is unknown', () => {
    expect(transformTreePage(node, '5', undefined, false).status).toBe('unknown')
  })

  it('parentId is the composite id of the enclosing node; raw omits the children', () => {
    const t = transformTreePage(node, '5', '3', true)
    expect(t.parentId).toBe('5:3')
    expect(t.metadata['isPrivate']).toBe('true')
    expect(t.raw).not.toHaveProperty('childPages')
  })
})
