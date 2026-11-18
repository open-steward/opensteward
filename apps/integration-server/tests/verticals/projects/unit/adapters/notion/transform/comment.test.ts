import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawNotionComment,
} from '../../../../../../../src/verticals/projects/adapters/notion/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

function makeComment(overrides: Partial<RawNotionComment> = {}): RawNotionComment {
  return {
    object: 'comment',
    id: 'cmt-notion-1',
    parent: { type: 'page_id', page_id: 'page-task-1' },
    discussion_id: 'disc-1',
    rich_text: [{ type: 'text', plain_text: 'Great work!' }],
    created_by: { id: 'usr-notion-1' },
    created_time: '2024-03-10T08:00:00.000Z',
    last_edited_time: '2024-03-10T09:00:00.000Z',
    ...overrides,
  }
}

describe('notion transformComment', () => {
  it('maps id and externalId from raw.id', () => {
    const result = transformComment(makeComment())
    expect(result.id).toBe('cmt-notion-1')
    expect(result.externalId).toBe('cmt-notion-1')
  })

  it('taskId from explicit taskId arg', () => {
    const result = transformComment(makeComment(), 'task-override')
    expect(result.taskId).toBe('task-override')
  })

  it('taskId from raw.parent.page_id when parent.type is page_id', () => {
    const result = transformComment(makeComment())
    expect(result.taskId).toBe('page-task-1')
  })

  it('taskId is undefined when parent type is not page_id', () => {
    const result = transformComment(
      makeComment({ parent: { type: 'block_id', block_id: 'block-1' } }),
    )
    expect(result.taskId).toBeUndefined()
  })

  it('maps projectId from explicit projectId arg', () => {
    const result = transformComment(makeComment(), undefined, 'proj-1')
    expect(result.projectId).toBe('proj-1')
  })

  it('maps authorId from raw.created_by.id', () => {
    const result = transformComment(makeComment())
    expect(result.authorId).toBe('usr-notion-1')
  })

  it('maps body from rich_text plain_text', () => {
    const result = transformComment(makeComment())
    expect(result.body).toBe('Great work!')
  })

  it('body is empty string when rich_text is absent', () => {
    const result = transformComment(makeComment({ rich_text: undefined }))
    expect(result.body).toBe('')
  })

  it('extracts mention user ids from rich_text mention entries', () => {
    const result = transformComment(
      makeComment({
        rich_text: [
          { type: 'text', plain_text: 'Hello ' },
          {
            type: 'mention',
            plain_text: '@Alice',
            mention: { user: { id: 'usr-alice' } },
          } as RawNotionComment['rich_text'] extends (infer T)[] | undefined ? T : never,
        ],
      }),
    )
    expect(result.mentions).toEqual(['usr-alice'])
  })

  it('mentions is empty when no mention entries', () => {
    const result = transformComment(makeComment())
    expect(result.mentions).toEqual([])
  })

  it('attachmentCount is always 0', () => {
    const result = transformComment(makeComment())
    expect(result.attachmentCount).toBe(0)
  })

  it('maps createdAt from raw.created_time', () => {
    const result = transformComment(makeComment())
    expect(result.createdAt).toBe('2024-03-10T08:00:00.000Z')
  })

  it('falls back to epoch when created_time is absent', () => {
    const result = transformComment(makeComment({ created_time: undefined }))
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('maps updatedAt from raw.last_edited_time', () => {
    const result = transformComment(makeComment())
    expect(result.updatedAt).toBe('2024-03-10T09:00:00.000Z')
  })

  it('platform is notion', () => {
    const result = transformComment(makeComment())
    expect(result.platform).toBe('notion')
  })

  it('metadata.discussionId reflects raw.discussion_id', () => {
    const result = transformComment(makeComment())
    expect(result.metadata.discussionId).toBe('disc-1')
  })

  it('passes CommentSchema.parse without throwing', () => {
    const result = transformComment(makeComment())
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
