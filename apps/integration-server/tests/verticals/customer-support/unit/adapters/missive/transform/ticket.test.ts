/**
 * Fixture: the "List conversations" example response at
 * https://missiveapp.com/docs/developers/rest-api/endpoints, copied verbatim
 * (DOC_LIST_EXAMPLE). DOC_EXAMPLE adds only `external_authors`, which the
 * "Conversation properties" table marks as always present ("Subset of authors
 * excluding coworkers") but the example leaves out.
 */
import { describe, it, expect } from 'vitest'
import {
  isGuestConversation,
  transformTicket,
  type RawMissiveConversation,
} from '../../../../../../../src/verticals/customer-support/adapters/missive/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

const DOC_LIST_EXAMPLE = {
  id: '6d3c9b1c-7067-4a28-8ea6-ea91340b67cc',
  created_at: 1654544954,
  subject: null,
  latest_message_subject: 'Question?',
  organization: { id: '96cafdc6-ec6a-4439-9b0c-f55a1133b1e7', name: 'Conference Badge' },
  color: null,
  assignees: [],
  users: [
    {
      id: 'dc3c4104-eced-4206-b532-ef84b331778a',
      name: 'Chad Zemlak',
      email: 'chad@conferencebade.com',
      unassigned: false,
      closed: false,
      archived: false,
      trashed: false,
      junked: false,
      assigned: false,
      flagged: true,
      snoozed: false,
    },
  ],
  attachments_count: 0,
  messages_count: 1,
  authors: [{ name: 'Samwise Gamgee', address: 'sam@fellowship.org' }],
  drafts_count: 0,
  send_later_messages_count: 0,
  tasks_count: 0,
  completed_tasks_count: 0,
  web_url: 'https://mail.missiveapp.com/#inbox/conversations/6d3c9b1c-7067-4a28-8ea6-ea91340b67cc',
  app_url:
    'missive://mail.missiveapp.com/#inbox/conversations/6d3c9b1c-7067-4a28-8ea6-ea91340b67cc',
  assignee_names: '',
  assignee_emails: '',
  shared_label_names: '',
  last_activity_at: 1654544954,
  team: {
    id: 'f36b7570-078e-408e-9cb8-2b4441ad93c0',
    name: 'Team 1',
    organization: '96cafdc6-ec6a-4439-9b0c-f55a1133b1e7',
    active_members: ['dc3c4104-eced-4206-b532-ef84b331778a'],
    observers: [],
  },
  shared_labels: [],
}

const DOC_EXAMPLE: RawMissiveConversation = {
  ...DOC_LIST_EXAMPLE,
  external_authors: [{ name: 'Samwise Gamgee', address: 'sam@fellowship.org' }],
}

describe('missive transformTicket (documented conversation example)', () => {
  it('parses with TicketSchema', () => {
    expect(() => TicketSchema.parse(transformTicket(DOC_EXAMPLE))).not.toThrow()
  })

  it('maps the documented fields', () => {
    const t = TicketSchema.parse(transformTicket(DOC_EXAMPLE))
    expect(t.id).toBe('6d3c9b1c-7067-4a28-8ea6-ea91340b67cc')
    expect(t.externalId).toBe('6d3c9b1c-7067-4a28-8ea6-ea91340b67cc')
    expect(t.number).toBeUndefined()
    // subject is null, so the latest message's subject stands in.
    expect(t.subject).toBe('Question?')
    expect(t.requesterId).toBe('sam@fellowship.org')
    expect(t.assigneeId).toBeUndefined()
    expect(t.teamId).toBe('f36b7570-078e-408e-9cb8-2b4441ad93c0')
    expect(t.tagIds).toEqual([])
    expect(t.createdAt).toBe('2022-06-06T19:49:14.000Z')
    expect(t.updatedAt).toBe('2022-06-06T19:49:14.000Z')
    expect(t.metadata).toEqual({
      messagesCount: '1',
      organizationId: '96cafdc6-ec6a-4439-9b0c-f55a1133b1e7',
      webUrl: DOC_EXAMPLE.web_url,
      appUrl: DOC_EXAMPLE.app_url,
    })
  })

  it('status and channel are unknown: Missive documents neither per conversation', () => {
    const t = TicketSchema.parse(transformTicket(DOC_EXAMPLE))
    expect(t.status).toBe('unknown')
    expect(t.channel).toBe('unknown')
    expect(t.closedAt).toBeUndefined()
  })

  it('closed_at makes the ticket closed at that time', () => {
    const t = TicketSchema.parse(transformTicket({ ...DOC_EXAMPLE, closed_at: 1654600000 }))
    expect(t.status).toBe('closed')
    expect(t.closedAt).toBe('2022-06-07T11:06:40.000Z')
  })

  it('subject wins over latest_message_subject; assignee, labels by documented id', () => {
    const t = TicketSchema.parse(
      transformTicket({
        ...DOC_EXAMPLE,
        subject: 'Refund approved',
        assignees: [{ id: 'dc3c4104-eced-4206-b532-ef84b331778a', name: 'Chad Zemlak' }],
        shared_labels: [{ id: '9825718b-3407-40b8-800d-a27361c86102', name: 'Billing' }],
      }),
    )
    expect(t.subject).toBe('Refund approved')
    expect(t.assigneeId).toBe('dc3c4104-eced-4206-b532-ef84b331778a')
    expect(t.tagIds).toEqual(['9825718b-3407-40b8-800d-a27361c86102'])
  })

  it('reads the requester from external_authors, not from coworker authors', () => {
    const t = transformTicket({
      ...DOC_EXAMPLE,
      authors: [
        { name: 'Chad Zemlak', address: 'chad@conferencebade.com' },
        { name: 'Samwise Gamgee', address: 'sam@fellowship.org' },
      ],
    })
    expect(t.requesterId).toBe('sam@fellowship.org')
  })

  it('a guest row ("only id and last_activity_at") is detected and not transformed', () => {
    const guest: RawMissiveConversation = { id: 'g1', last_activity_at: 1654544954 }
    expect(isGuestConversation(guest)).toBe(true)
    expect(isGuestConversation(DOC_EXAMPLE)).toBe(false)
    expect(() => transformTicket(guest)).toThrow(/has no created_at/)
  })

  it('updatedAt is last_activity_at, not created_at', () => {
    const t = TicketSchema.parse(transformTicket({ ...DOC_EXAMPLE, last_activity_at: 1654600000 }))
    expect(t.createdAt).toBe('2022-06-06T19:49:14.000Z')
    expect(t.updatedAt).toBe('2022-06-07T11:06:40.000Z')
  })
})
