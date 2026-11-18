/**
 * HelpDesk (hellotars-support) ticket event -> canonical Message.
 *
 * Fixtures follow the documented TicketEvent shapes in the HelpDesk API
 * reference (https://api.helpdesk.com/docs, GET /v1/tickets/{ticketID},
 * TicketResult "events"): TicketEventBase { ID, source, author, date } plus,
 * for `type: "message"` and `type: "followUpSent"`, a `message` object
 * { isPrivate, text, richTextHtml, richTextObj }. TicketEventAuthor is
 * { type: "agent", ID, name } | { type: "rule", ID, name } |
 * { type: "system", ID } | { type: "client", name }.
 */
import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  splitCompositeId,
  isMessageEvent,
  type RawHelpdeskTicketEvent,
} from '../../../../../../../src/verticals/customer-support/adapters/hellotars-support/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

const TICKET = '42e113f9-9353-4e89-9f68-69b92f423b0c'

const agentReply: RawHelpdeskTicketEvent = {
  ID: 'b1f0c1de-0000-4000-8000-000000000001',
  type: 'message',
  date: '2020-04-30T22:02:08.901Z',
  source: { type: 'email' },
  author: { type: 'agent', ID: 'f56caf69-3f05-4386-9567-fdc909d7ad77', name: 'John Agent' },
  message: {
    isPrivate: false,
    text: 'Thanks, we are on it.',
    richTextHtml: null,
    richTextObj: null,
  },
}

const clientMessage: RawHelpdeskTicketEvent = {
  ID: 'b1f0c1de-0000-4000-8000-000000000002',
  type: 'message',
  date: '2020-04-30T21:00:00.000Z',
  source: { type: 'email' },
  author: { type: 'client', name: 'John Client' },
  message: { isPrivate: false, text: 'My order never arrived.' },
}

describe('hellotars-support transformMessage', () => {
  it('maps a documented agent message event onto a valid canonical Message', () => {
    const msg = MessageSchema.parse(transformMessage(agentReply, TICKET))
    expect(msg).toMatchObject({
      id: `${TICKET}:b1f0c1de-0000-4000-8000-000000000001`,
      externalId: 'b1f0c1de-0000-4000-8000-000000000001',
      ticketId: TICKET,
      authorId: 'f56caf69-3f05-4386-9567-fdc909d7ad77',
      authorType: 'user',
      body: 'Thanks, we are on it.',
      type: 'public',
      createdAt: '2020-04-30T22:02:08.901Z',
      platform: 'hellotars-support',
    })
    expect(msg.metadata).toEqual({
      eventType: 'message',
      authorType: 'agent',
      authorName: 'John Agent',
      sourceType: 'email',
    })
    expect(msg.attachmentCount).toBeUndefined()
  })

  it('maps a client author (documented with a name only) to contact with no author id', () => {
    const msg = MessageSchema.parse(transformMessage(clientMessage, TICKET))
    expect(msg.authorType).toBe('contact')
    expect(msg.authorId).toBe('')
    expect(msg.metadata['authorName']).toBe('John Client')
  })

  it('maps a private message to an internal note', () => {
    const msg = MessageSchema.parse(
      transformMessage({ ...agentReply, message: { isPrivate: true, text: 'note' } }, TICKET),
    )
    expect(msg.type).toBe('internal')
  })

  it('reports "unknown" when isPrivate is absent rather than guessing public', () => {
    const msg = MessageSchema.parse(
      transformMessage({ ...agentReply, message: { text: 'x' } }, TICKET),
    )
    expect(msg.type).toBe('unknown')
  })

  it.each([
    ['rule', 'system'],
    ['system', 'system'],
    ['agent', 'user'],
    ['client', 'contact'],
    ['something-new', 'unknown'],
  ])('maps author.type %s to %s', (type, expected) => {
    const msg = MessageSchema.parse(
      transformMessage({ ...agentReply, author: { type, ID: 'a1' } }, TICKET),
    )
    expect(msg.authorType).toBe(expected)
  })

  it('maps a followUpSent event, which carries the same message object', () => {
    const msg = MessageSchema.parse(
      transformMessage({ ...agentReply, type: 'followUpSent' }, TICKET),
    )
    expect(msg.metadata['eventType']).toBe('followUpSent')
    expect(msg.body).toBe('Thanks, we are on it.')
  })

  it('throws on an event without its documented ID or date instead of inventing one', () => {
    expect(() => transformMessage({ ...agentReply, ID: null }, TICKET)).toThrow(/no ID/)
    expect(() => transformMessage({ ...agentReply, date: null }, TICKET)).toThrow(/no date/)
  })
})

describe('hellotars-support isMessageEvent', () => {
  it('keeps message and followUpSent events and drops the other documented event types', () => {
    expect(isMessageEvent({ type: 'message' })).toBe(true)
    expect(isMessageEvent({ type: 'followUpSent' })).toBe(true)
    for (const type of [
      'status',
      'tags',
      'assignment',
      'attachments',
      'ratingRequestSent',
      'priority',
    ]) {
      expect(isMessageEvent({ type })).toBe(false)
    }
  })
})

describe('hellotars-support splitCompositeId', () => {
  it('round-trips the ticketID:eventID id', () => {
    const msg = transformMessage(agentReply, TICKET)
    expect(splitCompositeId(msg.id)).toEqual([TICKET, agentReply.ID])
  })

  it('returns an empty ticket id when the separator is absent', () => {
    expect(splitCompositeId('evt-1')).toEqual(['', 'evt-1'])
  })
})
