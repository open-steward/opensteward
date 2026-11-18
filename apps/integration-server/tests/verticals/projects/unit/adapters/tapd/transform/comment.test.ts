/**
 * Fixture: the documented example of GET https://api.tapd.cn/comments
 * https://open.tapd.cn/document/api-doc/API%E6%96%87%E6%A1%A3/api_reference/comment/get_comments.html
 * Fields: id 评论ID, title 标题, description 内容, author 评论人, entry_type 评论类型,
 * entry_id 评论所依附的业务对象实体id, created 创建时间, modified 最后更改时间,
 * workspace_id 项目ID, root_id 根评论ID, reply_id 评论回复的ID.
 */
import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawTapdComment,
} from '../../../../../../../src/verticals/projects/adapters/tapd/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

const DOC_COMMENT: RawTapdComment = {
  id: '1010104801048492751',
  title: '流转状态从 [规划中] 到 [实现中] 添加',
  description: '<b><i><u>adfasd</u></i></b>',
  author: 'v_xuanfang',
  entry_type: 'stories',
  entry_id: '1010104801858505231',
  created: '2020-06-09 10:51:06',
  modified: '2020-06-09 10:51:06',
  workspace_id: '10104801',
}

describe('tapd transformComment (documented /comments item)', () => {
  it('parses with CommentSchema and maps every documented field', () => {
    const c = CommentSchema.parse(transformComment(DOC_COMMENT, '10104801'))
    expect(c).toEqual(
      expect.objectContaining({
        // Scoped so getComment can send the required workspace_id.
        id: '10104801:1010104801048492751',
        externalId: '1010104801048492751',
        taskId: '1010104801858505231',
        projectId: '10104801',
        authorId: 'v_xuanfang',
        body: '<b><i><u>adfasd</u></i></b>',
        mentions: [],
        platform: 'tapd',
      }),
    )
    // TAPD documents no offset; the shared helper reads it as UTC, never host-local.
    expect(c.createdAt).toBe('2020-06-09T10:51:06.000Z')
    expect(c.updatedAt).toBe('2020-06-09T10:51:06.000Z')
    expect(c.attachmentCount).toBeUndefined()
    expect(c.metadata).toEqual({ entryType: 'stories', title: DOC_COMMENT.title })
  })

  it('keeps root_id and reply_id in metadata when present', () => {
    const c = CommentSchema.parse(
      transformComment({ ...DOC_COMMENT, root_id: '11', reply_id: '12' }, '10104801'),
    )
    expect(c.metadata).toEqual(expect.objectContaining({ rootId: '11', replyId: '12' }))
  })

  it('does not read title as the body when description is absent: it throws', () => {
    const { description: _d, ...noBody } = DOC_COMMENT
    expect(() => transformComment(noBody as RawTapdComment, '10104801')).toThrow(/description/)
  })

  it('only a comment on a story (entry_type stories) carries a taskId', () => {
    const bug = CommentSchema.parse(
      transformComment({ ...DOC_COMMENT, entry_type: 'bug' }, '10104801'),
    )
    expect(bug.taskId).toBeUndefined()
  })

  it('throws instead of inventing a created time', () => {
    const { created: _c, ...noCreated } = DOC_COMMENT
    expect(() => transformComment(noCreated as RawTapdComment, '10104801')).toThrow(/created/)
  })

  it('throws instead of inventing an author', () => {
    const { author: _a, ...noAuthor } = DOC_COMMENT
    expect(() => transformComment(noAuthor as RawTapdComment, '10104801')).toThrow(/author/)
  })
})
