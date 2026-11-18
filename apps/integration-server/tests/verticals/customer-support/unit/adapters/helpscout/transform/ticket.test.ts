/**
 * Fixture: the documented example of
 * https://developer.helpscout.com/mailbox-api/endpoints/conversations/get/
 * (fetched 2026-09-28; _links and styles trimmed).
 */
import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawHelpScoutConversation,
} from '../../../../../../../src/verticals/customer-support/adapters/helpscout/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

const documented: RawHelpScoutConversation = {
  id: 123,
  number: 12,
  threads: 2,
  type: 'email',
  folderId: 11,
  status: 'closed',
  state: 'published',
  subject: 'Help',
  preview: 'Preview',
  mailboxId: 13,
  assignee: { id: 99, type: 'user', first: 'Mr', last: 'Robot', email: 'none@nowhere.com' },
  createdBy: { id: 12, type: 'customer', email: 'bear@acme.com' },
  createdAt: '2012-03-15T22:46:22Z',
  closedBy: 14,
  closedAt: '2012-03-16T14:07:23Z',
  userUpdatedAt: '2012-03-16T14:07:23Z',
  customerWaitingSince: { time: '2012-07-24T20:18:33Z', friendly: '20 hours ago' },
  source: { type: 'email', via: 'customer' },
  tags: [{ id: 9150, color: '#929499', tag: 'vip' }],
  cc: ['bear@normal.com'],
  bcc: ['bear@secret.com'],
  primaryCustomer: {
    id: 238604,
    type: 'customer',
    first: 'Rob',
    last: 'Robertovic',
    email: 'rob@acme.com',
  },
  _embedded: { threads: [] },
}

describe('helpscout transformTicket', () => {
  it('parses the documented conversation against TicketSchema', () => {
    const out = TicketSchema.parse(transformTicket(documented))
    expect(out).toMatchObject({
      id: '123',
      externalId: '123',
      number: '12',
      subject: 'Help',
      status: 'closed',
      channel: 'email',
      requesterId: '238604',
      assigneeId: '99',
      tagIds: ['9150'],
      createdAt: '2012-03-15T22:46:22.000Z',
      closedAt: '2012-03-16T14:07:23.000Z',
      platform: 'helpscout',
    })
    expect(out.teamId).toBeUndefined()
    expect(out.updatedAt).toBeUndefined()
    expect(out.metadata).toMatchObject({
      mailboxId: '13',
      folderId: '11',
      state: 'published',
      sourceVia: 'customer',
    })
  })

  it('maps a team assignee to teamId, not assigneeId', () => {
    const out = TicketSchema.parse(
      transformTicket({ ...documented, assignee: { id: 4, type: 'team' } }),
    )
    expect(out.teamId).toBe('4')
    expect(out.assigneeId).toBeUndefined()
  })

  it('maps the documented statuses and types', () => {
    const at = (status: string, type = 'email') =>
      TicketSchema.parse(transformTicket({ ...documented, status, type }))
    expect(at('active').status).toBe('open')
    expect(at('pending').status).toBe('pending')
    expect(at('spam').status).toBe('unknown')
    expect(at('active').closedAt).toBeUndefined()
    expect(at('active', 'chat').channel).toBe('chat')
    expect(at('active', 'phone').channel).toBe('voice')
  })

  it('falls back to a customer creator when there is no primary customer', () => {
    const out = TicketSchema.parse(transformTicket({ ...documented, primaryCustomer: null }))
    expect(out.requesterId).toBe('12')
  })
})
