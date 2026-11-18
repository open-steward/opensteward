/**
 * Ruddr task tags: GET /task-tags returns `TaskTag` rows
 * `{ id, name, isActive, createdAt }` (https://docs.ruddr.io/openapi.json,
 * operationId list-task-tags / get-a-task-tag). Ruddr documents no workspace
 * id, so the canonical `workspaceId` is the one the caller scoped the list
 * to, and the transform requires it.
 */
import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawRuddrTag,
} from '../../../../../../../src/verticals/projects/adapters/ruddr/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

/** The documented GET /task-tags (and GET /task-tags/{id}) example row. */
const DOC_ROW: RawRuddrTag = {
  id: 'b3e1f4a2-89cd-4f17-b62a-5d3c0e7f91a8',
  name: 'Launch',
  isActive: true,
  createdAt: '2025-03-10T14:22:45.183Z',
}

describe('ruddr transformTag', () => {
  it('maps the documented GET /task-tags example row and parses as a Tag', () => {
    const tag = TagSchema.parse(transformTag(DOC_ROW, 'ws-42'))
    expect(tag).toMatchObject({
      id: 'b3e1f4a2-89cd-4f17-b62a-5d3c0e7f91a8',
      externalId: 'b3e1f4a2-89cd-4f17-b62a-5d3c0e7f91a8',
      workspaceId: 'ws-42',
      name: 'Launch',
      platform: 'ruddr',
    })
    expect(tag.color).toBeUndefined()
  })

  it('carries the documented isActive and createdAt in metadata', () => {
    const tag = transformTag(DOC_ROW, 'ws-42')
    expect(tag.metadata).toEqual({ isActive: 'true', createdAt: '2025-03-10T14:22:45.183Z' })
  })

  it('an inactive tag reports isActive "false"', () => {
    expect(transformTag({ ...DOC_ROW, isActive: false }, 'ws-1').metadata['isActive']).toBe('false')
  })

  it('refuses an empty workspaceId rather than inventing one', () => {
    expect(() => transformTag(DOC_ROW, '')).toThrow(/workspace/)
  })

  it('refuses a row without the documented name rather than naming it ""', () => {
    const { name: _omit, ...noName } = DOC_ROW
    expect(() => transformTag(noName as RawRuddrTag, 'ws-1')).toThrow(/no name/)
  })
})
