import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  transformSourceMessage,
  isMessagePart,
  type RawIntercomConversationPart,
} from '../../../../../../../src/verticals/customer-support/adapters/intercom/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

const part: RawIntercomConversationPart = {
  type: 'conversation_part',
  id: '149',
  part_type: 'comment',
  body: 'Thanks!',
  created_at: 1734537470,
  author: { type: 'admin', id: '991267459', name: 'Ciaran Lee', email: 'admin@email.com' },
  attachments: [{ type: 'upload', name: 'a.png' }],
  redacted: false,
}

describe('transformMessage (Intercom conversation part)', () => {
  it('maps a comment and parses', () => {
    const m = MessageSchema.parse(transformMessage(part, '471'))
    expect(m).toMatchObject({
      id: '149',
      ticketId: '471',
      authorId: '991267459',
      authorType: 'user',
      body: 'Thanks!',
      type: 'public',
      attachmentCount: 1,
      createdAt: '2024-12-18T15:57:50.000Z',
      platform: 'intercom',
    })
    expect(m.metadata).toEqual({ partType: 'comment', authorType: 'admin', redacted: 'false' })
  })

  it.each([
    ['admin', 'user'],
    ['user', 'contact'],
    ['bot', 'system'],
    ['team', 'unknown'],
  ])('author.type %s → %s', (type, authorType) => {
    expect(
      MessageSchema.parse(transformMessage({ ...part, author: { type, id: 'x' } }, '1')).authorType,
    ).toBe(authorType)
  })

  it('maps a note to internal', () => {
    expect(MessageSchema.parse(transformMessage({ ...part, part_type: 'note' }, '1')).type).toBe(
      'internal',
    )
  })

  it('keeps only comment and note parts as messages', () => {
    expect(isMessagePart(part)).toBe(true)
    expect(isMessagePart({ ...part, part_type: 'note' })).toBe(true)
    for (const t of [
      'assignment',
      'close',
      'open',
      'snoozed',
      'conversation_attribute_updated_by_admin',
      // inherited Object.prototype names are not part types
      'toString',
      'constructor',
    ]) {
      expect(isMessagePart({ ...part, part_type: t })).toBe(false)
    }
  })
})

describe('transformSourceMessage (the opening message)', () => {
  it('uses the source id and the conversation’s created_at', () => {
    const m = transformSourceMessage(
      {
        type: 'conversation',
        id: '403918320',
        delivered_as: 'customer_initiated',
        body: 'hello',
        author: { type: 'user', id: 'u1' },
        attachments: [],
      },
      '471',
      1734537460,
    )
    expect(MessageSchema.parse(m)).toMatchObject({
      id: '403918320',
      ticketId: '471',
      authorType: 'contact',
      authorId: 'u1',
      type: 'public',
      body: 'hello',
      attachmentCount: 0,
      createdAt: '2024-12-18T15:57:40.000Z',
    })
    expect(m?.metadata['partType']).toBe('source')
  })

  it('is undefined without a source or a source id', () => {
    expect(transformSourceMessage(undefined, '1', 0)).toBeUndefined()
    expect(transformSourceMessage({ id: null, body: 'x' }, '1', 0)).toBeUndefined()
  })
})
