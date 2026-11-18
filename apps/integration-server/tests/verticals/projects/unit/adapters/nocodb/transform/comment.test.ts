/**
 * NocoDB row comment → canonical Comment.
 *
 * GET /api/v2/meta/comments?row_id=&fk_model_id= ("List Comments", NocoDB's
 * own OpenAPI,
 * https://raw.githubusercontent.com/nocodb/nocodb/develop/packages/nocodb/src/schema/swagger-v2.json)
 * answers `{ list: Comment[] }`. The fixture is the spec's own "Example 1"
 * record, verbatim (note its empty `created_by`).
 */
import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawNocodbComment,
} from '../../../../../../../src/verticals/projects/adapters/nocodb/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

function makeComment(overrides: Partial<RawNocodbComment> = {}): RawNocodbComment {
  return {
    id: 'adt_3sii7erfwrlegb',
    source_id: null,
    base_id: 'p_63b4q0qengen1x',
    fk_model_id: 'md_5mipbdg6ketmv8',
    row_id: '1',
    created_by: '',
    resolved_by: '',
    parent_comment_id: null,
    status: null,
    comment: 'bar',
    created_at: '2023-03-13T09:39:14.225Z',
    updated_at: '2023-03-13T09:39:14.225Z',
    ...overrides,
  }
}

describe('nocodb transformComment', () => {
  it('parses the documented example with CommentSchema', () => {
    expect(() => CommentSchema.parse(transformComment(makeComment()))).not.toThrow()
  })

  it('builds id as {fk_model_id}:{row_id}:{id} and takes externalId from id', () => {
    const c = transformComment(makeComment())
    expect(c.id).toBe('md_5mipbdg6ketmv8:1:adt_3sii7erfwrlegb')
    expect(c.externalId).toBe('adt_3sii7erfwrlegb')
  })

  it('builds taskId as {fk_model_id}:{row_id}, the id listTasks returns', () => {
    expect(transformComment(makeComment()).taskId).toBe('md_5mipbdg6ketmv8:1')
  })

  it('takes projectId from base_id (projects are bases)', () => {
    expect(transformComment(makeComment()).projectId).toBe('p_63b4q0qengen1x')
  })

  it('takes authorId from created_by verbatim, empty as documented', () => {
    expect(transformComment(makeComment()).authorId).toBe('')
    expect(transformComment(makeComment({ created_by: 'usr0Adp9PMG9o7uJy' })).authorId).toBe(
      'usr0Adp9PMG9o7uJy',
    )
  })

  it('takes body from comment', () => {
    expect(transformComment(makeComment()).body).toBe('bar')
  })

  it('takes createdAt and updatedAt from created_at and updated_at', () => {
    const c = transformComment(makeComment({ updated_at: '2023-03-14T01:02:03.000Z' }))
    expect(c.createdAt).toBe('2023-03-13T09:39:14.225Z')
    expect(c.updatedAt).toBe('2023-03-14T01:02:03.000Z')
  })

  it('counts documented attachments, and omits the count when none are sent', () => {
    expect(transformComment(makeComment()).attachmentCount).toBeUndefined()
    expect(
      transformComment(makeComment({ attachments: [{ url: 'a' }, { url: 'b' }] })).attachmentCount,
    ).toBe(2)
  })

  it('keeps attachment content out of raw, surfacing only the count', () => {
    const c = transformComment(
      makeComment({ attachments: [{ url: 'https://x/a', path: 'p', data: 'd' }] }),
    )
    expect(c.attachmentCount).toBe(1)
    expect(c.raw).not.toHaveProperty('attachments')
    expect(JSON.stringify(c.raw)).not.toContain('https://x/a')
  })

  it('records a reply parent and a resolver in metadata only when set', () => {
    expect(transformComment(makeComment()).metadata).toEqual({})
    expect(
      transformComment(makeComment({ parent_comment_id: 'cmt043cx4r30343ff', resolved_by: 'usr1' }))
        .metadata,
    ).toEqual({ parentCommentId: 'cmt043cx4r30343ff', resolvedBy: 'usr1' })
  })

  it('throws rather than invent a date when created_at is absent', () => {
    expect(() => transformComment(makeComment({ created_at: undefined }))).toThrow(/created_at/)
  })

  it('throws rather than invent ids when id, row_id or fk_model_id is absent', () => {
    expect(() => transformComment(makeComment({ id: undefined }))).toThrow(/id/)
    expect(() => transformComment(makeComment({ row_id: undefined }))).toThrow(/row_id/)
    expect(() => transformComment(makeComment({ fk_model_id: undefined }))).toThrow(/fk_model_id/)
  })

  it('throws rather than invent a body when comment is absent', () => {
    expect(() => transformComment(makeComment({ comment: undefined }))).toThrow(/has no comment/)
  })

  it('throws rather than invent an author when created_by is absent', () => {
    expect(() => transformComment(makeComment({ created_by: undefined }))).toThrow(/created_by/)
  })

  it('platform is nocodb and mentions are empty', () => {
    const c = transformComment(makeComment())
    expect(c.platform).toBe('nocodb')
    expect(c.mentions).toEqual([])
  })
})
