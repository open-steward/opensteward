/**
 * Fixtures are entries of the GET /api/v1/tickets/{ticket_id}/conversations
 * response example (https://desk.zoho.com/DeskAPIDocument, Threads).
 */
import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  type RawZohoDeskConversation,
} from '../../../../../../../src/verticals/customer-support/adapters/zoho-desk/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema'

const AGENT_THREAD: RawZohoDeskConversation = {
  summary:
    'We have found the root cause for the issue and fixed it. How would you rate our customer service? Good Okey Bad',
  isDescriptionThread: true,
  visibility: 'public',
  author: {
    firstName: 'Jade',
    lastName: 'Tywin',
    name: 'Jade Tywin',
    type: 'AGENT',
    email: 'jade12tywin@zylker.com',
  },
  channel: 'FORUMS',
  type: 'thread',
  responderId: '1892000000042001',
  createdTime: '2016-07-07T10:12:04.177Z',
  attachmentCount: '7',
  id: '1892000001080014',
  contentType: 'text/html',
  status: 'SUCCESS',
  direction: 'out',
}

const CUSTOMER_THREAD: RawZohoDeskConversation = {
  channel: 'EMAIL',
  type: 'thread',
  createdTime: '2016-07-07T10:02:04.663Z',
  id: '1892000001080004',
  direction: 'in',
  summary: 'Any update regarding the issue',
  visibility: 'public',
  author: {
    firstName: 'Jade',
    lastName: 'Tywin',
    name: 'Jade Tywin',
    type: 'END_USER',
    email: 'jade12tywin@zylker.com',
  },
  attachmentCount: '6',
}

const COMMENT: RawZohoDeskConversation = {
  modifiedTime: '2016-02-16T14:12:20.000Z',
  commentedTime: '2016-02-16T09:21:58.000Z',
  isPublic: true,
  id: '1892000000886025',
  type: 'comment',
  content: 'There is a major issue with the real time dashboard feature . Kindly look into it',
  commenterId: '1892000000042001',
  commenter: {
    firstName: 'Jade',
    lastName: 'Tywin',
    name: 'Jade Tywin',
    roleName: 'LightAgent',
    type: 'AGENT',
    email: 'jade12tywin@zylker.com',
  },
}

describe('transformMessage', () => {
  it("maps an agent's thread: responder id, summary body, attachment count", () => {
    const m = MessageSchema.parse(transformMessage(AGENT_THREAD, '1892000000321001'))
    expect(m).toMatchObject({
      id: '1892000001080014',
      ticketId: '1892000000321001',
      authorId: '1892000000042001',
      authorType: 'user',
      type: 'public',
      body: AGENT_THREAD.summary,
      attachmentCount: 7,
      createdAt: '2016-07-07T10:12:04.177Z',
      platform: 'zoho-desk',
    })
    expect(m.metadata).toMatchObject({
      conversationType: 'thread',
      bodyIsSummary: 'true',
      direction: 'out',
      threadStatus: 'SUCCESS',
    })
  })

  it('marks an unsent draft thread (status DRAFT, as in the List all threads example)', () => {
    const m = MessageSchema.parse(transformMessage({ ...AGENT_THREAD, status: 'DRAFT' }, 't'))
    expect(m.metadata['threadStatus']).toBe('DRAFT')
  })

  it("maps a customer's thread: contact author, no invented id", () => {
    const m = MessageSchema.parse(transformMessage(CUSTOMER_THREAD, 't'))
    expect(m).toMatchObject({
      authorType: 'contact',
      authorId: '',
      body: 'Any update regarding the issue',
      attachmentCount: 6,
    })
  })

  it('reads a private thread as internal', () => {
    expect(
      MessageSchema.parse(transformMessage({ ...CUSTOMER_THREAD, visibility: 'private' }, 't'))
        .type,
    ).toBe('internal')
  })

  it('maps a comment: commenter, content, isPublic', () => {
    const m = MessageSchema.parse(transformMessage(COMMENT, 't'))
    expect(m).toMatchObject({
      id: '1892000000886025',
      authorId: '1892000000042001',
      authorType: 'user',
      type: 'public',
      body: COMMENT.content,
      createdAt: '2016-02-16T09:21:58.000Z',
    })
    expect(m.metadata).toEqual({ conversationType: 'comment' })
    expect(MessageSchema.parse(transformMessage({ ...COMMENT, isPublic: false }, 't')).type).toBe(
      'internal',
    )
  })

  it('an unrecognised author type is unknown', () => {
    expect(
      MessageSchema.parse(
        transformMessage({ id: '1', type: 'thread', author: { type: 'BOT' } }, 't'),
      ).authorType,
    ).toBe('unknown')
  })
})
