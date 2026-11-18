/**
 * Fixture: the documented thread in
 * https://developer.helpscout.com/mailbox-api/endpoints/conversations/threads/list/
 * (fetched 2026-09-28; _links trimmed).
 */
import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  type RawHelpScoutThread,
} from '../../../../../../../src/verticals/customer-support/adapters/helpscout/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

const documented: RawHelpScoutThread = {
  id: 1234,
  type: 'customer',
  status: 'active',
  state: 'published',
  action: {
    type: 'manual-workflow',
    text: 'You ran the Assign to Spam workflow',
    associatedEntities: {},
  },
  body: 'this is what i have to say: I love your service.',
  source: { type: 'email', via: 'customer' },
  customer: { id: 29418, first: 'Vernon', last: 'Bear', email: 'vbear@mywork.com' },
  createdBy: { id: 29418, type: 'customer' },
  assignedTo: {
    id: 1234,
    type: 'team',
    first: 'Jack',
    last: 'Sprout',
    email: 'jack.sprout@gmail.com',
  },
  savedReplyId: 10,
  to: ['to1@somewhere.com', 'to2@somewhere.com'],
  createdAt: '2015-06-05T20:18:33Z',
  openedAt: '2015-06-07T10:01:25Z',
  _embedded: {
    attachments: [
      {
        id: 1234,
        filename: 'photo1.jpg',
        mimeType: 'image/jpeg',
        width: 600,
        height: 800,
        size: 20191,
        state: 'valid',
      },
    ],
  },
}

describe('helpscout transformMessage', () => {
  it('parses the documented thread against MessageSchema', () => {
    const out = MessageSchema.parse(transformMessage(documented, '123'))
    expect(out).toMatchObject({
      id: '1234',
      externalId: '1234',
      ticketId: '123',
      authorId: '29418',
      authorType: 'contact',
      body: 'this is what i have to say: I love your service.',
      type: 'public',
      attachmentCount: 1,
      createdAt: '2015-06-05T20:18:33.000Z',
      platform: 'helpscout',
    })
  })

  it('reads a note as internal and a user author as user', () => {
    const out = MessageSchema.parse(
      transformMessage({ ...documented, type: 'note', createdBy: { id: 4, type: 'user' } }, '123'),
    )
    expect(out.type).toBe('internal')
    expect(out.authorType).toBe('user')
    expect(out.authorId).toBe('4')
  })

  it('leaves a lineitem neither public nor internal', () => {
    const out = MessageSchema.parse(
      transformMessage({ id: 5, type: 'lineitem', createdAt: '2015-06-05T20:18:33Z' }, '123'),
    )
    expect(out.type).toBe('unknown')
    expect(out.body).toBe('')
    expect(out.attachmentCount).toBeUndefined()
  })
})
