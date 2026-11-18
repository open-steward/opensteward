/**
 * Fixture fields follow mci_issue_note_data_as_array in
 * https://raw.githubusercontent.com/mantisbt/mantisbt/master/api/soap/mc_issue_api.php
 * (REST branch: id, reporter, text, view_state, attachments, type,
 * created_at, updated_at), with values from the vendor's Postman examples.
 */
import { describe, it, expect } from 'vitest'
import {
  transformNote,
  type RawMantisbtNote,
} from '../../../../../../../src/verticals/projects/adapters/mantisbt/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('mantisbt transformNote', () => {
  const raw: RawMantisbtNote = {
    id: 54527,
    reporter: {
      id: 36771,
      name: 'vboctoradmin',
      real_name: 'Victor Admin',
      email: 'vboctor@mantisbt.org',
    },
    text: 'This is a note from issue update.',
    view_state: { id: 10, name: 'public', label: 'public' },
    attachments: [{ id: 1 }, { id: 2 }],
    type: 'note',
    created_at: '2017-04-23T13:12:28-04:00',
    updated_at: '2017-04-24T13:12:28-04:00',
  }

  it('parses with CommentSchema and maps the documented fields', () => {
    const result = CommentSchema.parse(transformNote(raw, '1234', '1'))
    expect(result).toMatchObject({
      id: '1234:54527',
      externalId: '54527',
      taskId: '1234',
      projectId: '1',
      authorId: '36771',
      body: 'This is a note from issue update.',
      mentions: [],
      attachmentCount: 2,
      createdAt: '2017-04-23T17:12:28.000Z',
      updatedAt: '2017-04-24T17:12:28.000Z',
      platform: 'mantisbt',
      metadata: { viewState: 'public', type: 'note' },
    })
  })

  it('the id is {issueId}:{noteId}, the form getComment reads back', () => {
    expect(transformNote(raw, '9', undefined).id).toBe('9:54527')
  })

  it('omits attachmentCount when attachments is absent', () => {
    const { attachments: _a, ...noAttachments } = raw
    const result = CommentSchema.parse(transformNote(noAttachments, '1234', '1'))
    expect(result.attachmentCount).toBeUndefined()
  })

  it('throws instead of inventing a note id, author or creation time', () => {
    const { id: _i, ...noId } = raw
    const { reporter: _r, ...noReporter } = raw
    const { created_at: _c, ...noCreated } = raw
    expect(() => transformNote(noId, '1234', '1')).toThrow(/id/)
    expect(() => transformNote(noReporter, '1234', '1')).toThrow(/reporter/)
    expect(() => transformNote(noCreated, '1234', '1')).toThrow(/created_at/)
  })
})
