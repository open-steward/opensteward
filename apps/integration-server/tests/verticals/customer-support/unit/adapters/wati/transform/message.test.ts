/**
 * transformMessage over the documented "Get messages" example item
 * (https://docs.wati.io/reference/conversations_getmessagesbyconversationid.md).
 *
 * `owner` "Indicates if the message was sent by the business (true) or
 * customer (false)", and `assigned_id` is the "Unique identifier of the
 * operator assigned to handle this conversation" — not the sender
 * (https://docs.wati.io/reference/message-received.md,
 * https://docs.wati.io/reference/session-message-sent.md).
 */
import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  type RawWatiMessage,
} from '../../../../../../../src/verticals/customer-support/adapters/wati/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

/** The documented example item, verbatim. */
const DOC_EXAMPLE: RawWatiMessage = {
  text: 'Hello, this is a sample message!',
  type: 'text',
  timestamp: '2026-07-14T16:15:38.3978844Z',
  owner: true,
  status: 'delivered',
  avatar_url: 'https://example.com/avatar.png',
  assigned_id: '6858f59a3374901cc1c8223f',
  operator_name: 'John Doe',
  bot_type: 'regular',
  local_message_id: '88aed3c93a050b3c53978463',
  id: '507f1f77bcf86cd799439011',
  created: '2026-07-14T16:15:38.3978836Z',
  conversation_id: '685bd235e6119686e693a093',
  ticket_id: '68aed3c93a050b3c53978463',
  event_type: 'message',
}

describe('transformMessage', () => {
  it('maps the documented example item and parses with MessageSchema', () => {
    const msg = MessageSchema.parse(transformMessage(DOC_EXAMPLE, '14155552671'))

    expect(msg.id).toBe('507f1f77bcf86cd799439011')
    expect(msg.externalId).toBe('507f1f77bcf86cd799439011')
    // The conversation the caller listed, which is the ticket the router scoped by.
    expect(msg.ticketId).toBe('14155552671')
    expect(msg.authorType).toBe('user')
    // No documented field names the sender; assigned_id is the conversation's assignee.
    expect(msg.authorId).toBe('')
    expect(msg.body).toBe('Hello, this is a sample message!')
    // No documented field distinguishes a customer-visible reply from an internal note.
    expect(msg.type).toBe('unknown')
    expect(msg.createdAt).toBe('2026-07-14T16:15:38.397Z')
    expect(msg.platform).toBe('wati')
    expect(msg.metadata).toEqual({
      messageType: 'text',
      status: 'delivered',
      assignedId: '6858f59a3374901cc1c8223f',
      operatorName: 'John Doe',
      botType: 'regular',
      localMessageId: '88aed3c93a050b3c53978463',
      conversationId: '685bd235e6119686e693a093',
      watiTicketId: '68aed3c93a050b3c53978463',
      eventType: 'message',
    })
  })

  it('maps a customer message (owner=false) to authorType contact', () => {
    const msg = MessageSchema.parse(transformMessage({ ...DOC_EXAMPLE, owner: false }, 'c'))
    expect(msg.authorType).toBe('contact')
  })

  it('maps an absent owner to authorType unknown', () => {
    const { owner: _owner, ...rest } = DOC_EXAMPLE
    const msg = MessageSchema.parse(transformMessage(rest, 'c'))
    expect(msg.authorType).toBe('unknown')
  })

  it('reads created only, never the timestamp field', () => {
    const msg = transformMessage(
      { ...DOC_EXAMPLE, created: '2026-01-02T03:04:05Z', timestamp: '2030-01-01T00:00:00Z' },
      'c',
    )
    expect(msg.createdAt).toBe('2026-01-02T03:04:05.000Z')
  })

  it('throws rather than invent an id when id is absent', () => {
    const { id: _id, ...rest } = DOC_EXAMPLE
    expect(() => transformMessage(rest, 'c')).toThrow(/id/)
  })

  it('throws rather than invent a date when created is absent', () => {
    const { created: _c, ...rest } = DOC_EXAMPLE
    expect(() => transformMessage(rest, 'c')).toThrow(/created/)
  })

  it('serves an empty body for a message with no text (media)', () => {
    const { text: _t, ...rest } = DOC_EXAMPLE
    const msg = MessageSchema.parse(transformMessage({ ...rest, type: 'image' }, 'c'))
    expect(msg.body).toBe('')
  })
})
