import { describe, it, expect } from 'vitest'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/rasayel/transform/message'
import { transformTag } from '../../../../../src/verticals/customer-support/adapters/rasayel/transform/tag'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/rasayel/transform/ticket'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/rasayel/transform/contact'
import { RasayelAdapter } from '../../../../../src/verticals/customer-support/adapters/rasayel/index'
import {
  ContactSchema,
  MessageSchema,
  TicketSchema,
} from '../../../../../src/verticals/customer-support/schema'

/**
 * Fixtures are the documented webhook examples, trimmed to the fields the
 * adapter selects (https://developers.rasayel.io/webhooks/message-created,
 * /webhooks/conversation-created, /webhooks/channel-user-created). The
 * examples omit `uuid` (`String!` in the schema), so one is added.
 */
const documentedTextMessage = {
  __typename: 'TextMessage',
  id: 7,
  uuid: 'msg-uuid-7',
  direction: 'INBOUND',
  createdAt: 1652973168,
  messageType: 'TEXT',
  messageCategory: 'USER',
  user: { id: 1, __typename: 'ChannelUser' },
  body: 'Hello',
}

describe('Rasayel transformMessage', () => {
  it('maps the documented message.created TextMessage', () => {
    const msg = MessageSchema.parse(transformMessage(documentedTextMessage, '1'))
    expect(msg).toMatchObject({
      id: '7',
      externalId: 'msg-uuid-7',
      ticketId: '1',
      authorId: '1',
      authorType: 'contact',
      body: 'Hello',
      type: 'public',
      createdAt: '2022-05-19T15:12:48.000Z',
      platform: 'rasayel',
    })
    expect(msg.attachmentCount).toBeUndefined()
    expect(msg.metadata).toEqual({
      messageKind: 'TextMessage',
      direction: 'INBOUND',
      messageType: 'TEXT',
      messageCategory: 'USER',
    })
  })

  it('a NoteMessage is internal, authored by an AppUser, with its attachment count', () => {
    const msg = MessageSchema.parse(
      transformMessage(
        {
          ...documentedTextMessage,
          __typename: 'NoteMessage',
          direction: 'NO_DIRECTION',
          user: { id: 9, __typename: 'AppUser' },
          body: 'internal',
          attachments: [{ mimeType: 'image/png' }, { mimeType: 'application/pdf' }],
        },
        '1',
      ),
    )
    expect(msg.type).toBe('internal')
    expect(msg.authorType).toBe('user')
    expect(msg.authorId).toBe('9')
    expect(msg.attachmentCount).toBe(2)
  })

  it('a media message takes its caption as the body', () => {
    const msg = MessageSchema.parse(
      transformMessage(
        {
          ...documentedTextMessage,
          __typename: 'ImageMessage',
          messageType: 'IMAGE',
          body: undefined,
          caption: 'a photo',
          attachments: [],
        },
        '1',
      ),
    )
    expect(msg.body).toBe('a photo')
    expect(msg.attachmentCount).toBe(0)
  })

  it('a message type with no text field has an empty body; a BotUser author is system', () => {
    const msg = MessageSchema.parse(
      transformMessage(
        {
          ...documentedTextMessage,
          __typename: 'StateActionMessage',
          messageCategory: 'EVENT',
          user: { id: 3, __typename: 'BotUser' },
          body: undefined,
        },
        '1',
      ),
    )
    expect(msg.body).toBe('')
    expect(msg.authorType).toBe('system')
  })
})

describe('Rasayel transformTag', () => {
  it('populates color from tagColor field', () => {
    const raw = { id: 10, uuid: 'tag-uuid', tagName: 'billing', tagColor: '#e53935' }
    const tag = transformTag(raw as any)
    expect(tag.color).toBe('#e53935')
    expect(tag.name).toBe('billing')
    expect(tag.platform).toBe('rasayel')
  })

  it('color is undefined when tagColor is absent', () => {
    const raw = { id: 11, uuid: 'tag-uuid2', tagName: 'urgent' }
    const tag = transformTag(raw as any)
    expect(tag.color).toBeUndefined()
  })
})

describe('Rasayel transformTicket', () => {
  /** The Conversation in the documented conversation.created example. */
  const documented = {
    id: 1,
    uuid: 'conv-uuid-1',
    state: 'OPENED',
    channelType: 'TELEGRAM',
    createdAt: 1652783952,
    contact: { id: 1 },
    assignee: null,
    assignedTeam: null,
    tags: { nodes: [] },
  }

  it('maps the documented conversation', () => {
    const t = TicketSchema.parse(transformTicket(documented))
    expect(t).toMatchObject({
      id: '1',
      externalId: 'conv-uuid-1',
      subject: '',
      status: 'open',
      channel: 'social',
      requesterId: '1',
      tagIds: [],
      createdAt: '2022-05-17T10:39:12.000Z',
      platform: 'rasayel',
    })
    expect(t.assigneeId).toBeUndefined()
    expect(t.teamId).toBeUndefined()
    expect(t.closedAt).toBeUndefined()
    expect(t.metadata).toEqual({ state: 'OPENED', channelType: 'TELEGRAM' })
  })

  it('maps assignee, team, tags and updatedAt', () => {
    const t = TicketSchema.parse(
      transformTicket({
        ...documented,
        assignee: { id: 4 },
        assignedTeam: { id: 8 },
        tags: { nodes: [{ id: 11 }, { id: 12 }] },
        updatedAt: 1652973168,
      }),
    )
    expect(t.assigneeId).toBe('4')
    expect(t.teamId).toBe('8')
    expect(t.tagIds).toEqual(['11', '12'])
    expect(t.updatedAt).toBe('2022-05-19T15:12:48.000Z')
  })

  it('a CLOSED conversation is closed with closedAt from lastClosedAt', () => {
    const t = TicketSchema.parse(
      transformTicket({
        ...documented,
        state: 'CLOSED',
        channelType: 'EMAIL',
        lastClosedAt: 1652973168,
        updatedAt: 1653000000,
      }),
    )
    expect(t.status).toBe('closed')
    expect(t.channel).toBe('email')
    expect(t.closedAt).toBe('2022-05-19T15:12:48.000Z')
    expect(t.updatedAt).toBe('2022-05-19T22:40:00.000Z')
  })

  it('maps UNANSWERED to open', () => {
    expect(TicketSchema.parse(transformTicket({ ...documented, state: 'UNANSWERED' })).status).toBe(
      'open',
    )
  })

  it('a reopened conversation keeps no closedAt', () => {
    const t = TicketSchema.parse(transformTicket({ ...documented, lastClosedAt: 1652973168 }))
    expect(t.closedAt).toBeUndefined()
  })

  it('maps SNOOZED to on_hold and an undocumented-meaning state to unknown', () => {
    expect(TicketSchema.parse(transformTicket({ ...documented, state: 'SNOOZED' })).status).toBe(
      'on_hold',
    )
    expect(
      TicketSchema.parse(transformTicket({ ...documented, state: 'WORKFLOW_BOT_CONTROLLED' }))
        .status,
    ).toBe('unknown')
    expect(
      TicketSchema.parse(transformTicket({ ...documented, channelType: 'TWILIO_SMS' })).channel,
    ).toBe('sms')
  })
})

describe('Rasayel transformContact', () => {
  /** The ChannelUser in the documented channel_user.created example. */
  const documented = {
    id: 1,
    uuid: 'cu-uuid-1',
    displayName: 'Ahmed Abbas',
    identifiers: [{ sourceId: '1765698763', category: 'TELEGRAM_ID' }],
  }

  it('maps the documented channel user', () => {
    const c = ContactSchema.parse(transformContact(documented))
    expect(c).toMatchObject({
      id: '1',
      externalId: 'cu-uuid-1',
      name: 'Ahmed Abbas',
      platform: 'rasayel',
    })
    expect(c.email).toBeUndefined()
    expect(c.phone).toBeUndefined()
  })

  it('reads email and phone from the EMAIL and PHONE identifiers', () => {
    const c = ContactSchema.parse(
      transformContact({
        ...documented,
        identifiers: [
          { sourceId: '+971500000000', category: 'PHONE' },
          { sourceId: 'ahmed@example.com', category: 'EMAIL' },
        ],
      }),
    )
    expect(c.email).toBe('ahmed@example.com')
    expect(c.phone).toBe('+971500000000')
  })

  it('omits an EMAIL identifier that is not an address', () => {
    const c = ContactSchema.parse(
      transformContact({
        ...documented,
        identifiers: [{ sourceId: 'not-an-email', category: 'EMAIL' }],
      }),
    )
    expect(c.email).toBeUndefined()
  })

  it('a contact with no displayName has an empty name', () => {
    expect(ContactSchema.parse(transformContact({ ...documented, displayName: null })).name).toBe(
      '',
    )
  })
})

describe('Rasayel adapter platform identity', () => {
  it('has platform=rasayel', () => {
    const adapter = new RasayelAdapter()
    expect(adapter.platform).toBe('rasayel')
  })

  it('verifyWebhook always returns true', () => {
    const adapter = new RasayelAdapter()
    expect(adapter.verifyWebhook(Buffer.from('{}'), {}, 'secret')).toBe(true)
  })

  it('parseWebhookEvents returns array with platform=rasayel', () => {
    const adapter = new RasayelAdapter()
    const events = adapter.parseWebhookEvents({
      event: 'conversation.created',
      id: 'ev1',
      data: { id: 'c1' },
    })
    expect(Array.isArray(events)).toBe(true)
    expect(events[0]!.platform).toBe('rasayel')
    expect(events[0]!.resourceType).toBe('tickets')
    expect(events[0]!.action).toBe('created')
  })
})
