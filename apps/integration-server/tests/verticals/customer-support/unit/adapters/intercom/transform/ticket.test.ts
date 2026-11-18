import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawIntercomConversation,
} from '../../../../../../../src/verticals/customer-support/adapters/intercom/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

/** Shape of the `conversation` example in the 2.16 OpenAPI description. */
const base: RawIntercomConversation = {
  type: 'conversation',
  id: '471',
  title: null,
  created_at: 1734537460,
  updated_at: 1734537560,
  state: 'closed',
  open: false,
  priority: 'medium',
  admin_assignee_id: 991267715,
  team_assignee_id: 5017691,
  tags: { type: 'tag.list', tags: [{ type: 'tag', id: '102', name: 'vip' }] },
  conversation_rating: { rating: 4 },
  source: {
    type: 'email',
    id: '403918320',
    delivered_as: 'customer_initiated',
    subject: 'Cannot log in',
    body: '<p>help</p>',
    author: { type: 'user', id: 'u1' },
  },
  contacts: {
    type: 'contact.list',
    contacts: [{ id: '6762f14a1bb69f9f2193bbb3', external_id: '70' }],
  },
  statistics: { last_close_at: 1734537600 },
}

describe('transformTicket (Intercom conversation)', () => {
  it('maps the documented conversation fields and parses', () => {
    const t = TicketSchema.parse(transformTicket(base))
    expect(t).toMatchObject({
      id: '471',
      externalId: '471',
      subject: 'Cannot log in',
      status: 'closed',
      priority: 'normal',
      channel: 'email',
      requesterId: '6762f14a1bb69f9f2193bbb3',
      assigneeId: '991267715',
      teamId: '5017691',
      tagIds: ['102'],
      satisfactionRating: 4,
      createdAt: '2024-12-18T15:57:40.000Z',
      closedAt: '2024-12-18T16:00:00.000Z',
      platform: 'intercom',
    })
    expect(t.metadata).toEqual({
      state: 'closed',
      priority: 'medium',
      sourceType: 'email',
      deliveredAs: 'customer_initiated',
    })
  })

  it.each([
    ['open', 'open'],
    ['snoozed', 'on_hold'],
    ['closed', 'closed'],
    ['weird', 'unknown'],
  ])('state %s → %s', (state, status) => {
    expect(TicketSchema.parse(transformTicket({ ...base, state })).status).toBe(status)
  })

  it.each([
    ['none', undefined],
    ['low', 'low'],
    ['medium', 'normal'],
    ['high', 'high'],
    ['urgent', 'urgent'],
  ])('priority %s → %s', (priority, want) => {
    expect(TicketSchema.parse(transformTicket({ ...base, priority })).priority).toBe(want)
  })

  it.each([
    ['conversation', 'chat'],
    ['whatsapp', 'social'],
    ['phone_call', 'voice'],
    ['sms', 'sms'],
    ['push', 'other'],
    ['carrier_pigeon', 'unknown'],
  ])('source.type %s → channel %s', (type, channel) => {
    expect(
      TicketSchema.parse(transformTicket({ ...base, source: { ...base.source, type } })).channel,
    ).toBe(channel)
  })

  it('prefers the title, treats unassigned (null / 0) as absent, drops closedAt while open', () => {
    const t = TicketSchema.parse(
      transformTicket({
        ...base,
        title: 'Titled',
        state: 'open',
        admin_assignee_id: null,
        team_assignee_id: 0,
        conversation_rating: null,
      }),
    )
    expect(t.subject).toBe('Titled')
    expect(t.assigneeId).toBeUndefined()
    expect(t.teamId).toBeUndefined()
    expect(t.closedAt).toBeUndefined()
    expect(t.satisfactionRating).toBeUndefined()
  })

  it('survives a minimal list item', () => {
    const t = TicketSchema.parse(transformTicket({ id: 5 }))
    expect(t).toMatchObject({
      id: '5',
      subject: '',
      requesterId: '',
      tagIds: [],
      status: 'unknown',
      channel: 'unknown',
    })
  })
})
