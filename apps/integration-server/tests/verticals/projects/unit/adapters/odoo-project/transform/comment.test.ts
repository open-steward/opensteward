/** mail.message rows; fields from addons/mail/models/mail_message.py, 19.0 (and 14.0). */
import { describe, expect, it } from 'vitest'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'
import { transformComment } from '../../../../../../../src/verticals/projects/adapters/odoo-project/transform/comment'

const base = {
  id: 101,
  body: '<p>Chairs ordered &lt;10&gt;.</p>',
  model: 'project.task',
  res_id: 21,
  message_type: 'comment',
  subtype_id: [2, 'Note'] as [number, string],
  is_internal: true,
  author_id: [3, 'Mitchell Admin'] as [number, string],
  create_uid: [2, 'Mitchell Admin'] as [number, string],
  attachment_ids: [40, 41],
  date: '2026-01-05 12:00:00',
  create_date: '2026-01-05 12:00:01',
  write_date: '2026-01-05 12:05:00',
}

describe('odoo-project transformComment', () => {
  it('maps a comment on a task, with the user (not the partner) as author', () => {
    const c = CommentSchema.parse(transformComment(base))
    expect(c).toMatchObject({
      id: '101',
      externalId: '101',
      taskId: '21',
      authorId: '2',
      body: 'Chairs ordered <10>.',
      mentions: [],
      attachmentCount: 2,
      createdAt: '2026-01-05T12:00:00.000Z',
      updatedAt: '2026-01-05T12:05:00.000Z',
      platform: 'odoo-project',
    })
    expect(c.projectId).toBeUndefined()
    expect(c.metadata).toEqual({ authorPartnerId: '3', subtypeId: '2', isInternal: 'true' })
  })

  it('a comment on a project carries the project id', () => {
    const c = CommentSchema.parse(
      transformComment({ ...base, model: 'project.project', res_id: 4 }),
    )
    expect(c.projectId).toBe('4')
    expect(c.taskId).toBeUndefined()
  })

  it('falls back to create_date, and tolerates absent fields', () => {
    const c = CommentSchema.parse(
      transformComment({ id: 5, body: false, date: false, create_date: '2026-01-01 00:00:00' }),
    )
    expect(c).toMatchObject({ body: '', authorId: '', createdAt: '2026-01-01T00:00:00.000Z' })
    expect(c.attachmentCount).toBeUndefined()
    expect(c.metadata).toEqual({})
  })
})
