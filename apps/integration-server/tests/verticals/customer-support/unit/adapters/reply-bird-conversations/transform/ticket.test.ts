/**
 * Bird email thread → canonical Ticket.
 *
 * Fixture: an `EmailThread` (https://bird.com/openapi.json, response of
 * `GET /v1/email/threads/{thread_id}`; https://bird.com/docs/api/reference/get-email-thread)
 * carrying every required field, with the spec's own examples:
 * ThreadID "thr_01krdgeqcxet5s7t44vh8rt9mg", MailboxID "mbx_01krdgeqcxet5s7t44vh8rt9mg",
 * ContactID "con_01krdgeqcxet5s7t44vh8rt9mg", subject "Re: Your order",
 * labels ["inbox", "urgent"], channel "email".
 */
import { describe, it, expect } from 'vitest'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'
import {
  transformTicket,
  type RawBirdThread,
} from '../../../../../../../src/verticals/customer-support/adapters/reply-bird-conversations/transform/ticket'

const THREAD: RawBirdThread = {
  id: 'thr_01krdgeqcxet5s7t44vh8rt9mg',
  mailbox_id: 'mbx_01krdgeqcxet5s7t44vh8rt9mg',
  channel: 'email',
  contact_id: 'con_01krdgeqcxet5s7t44vh8rt9mg',
  subject: 'Re: Your order',
  participants: ['concierge@inbox.ai', 'billing@acme.com'],
  message_count: 3,
  unread_count: 1,
  last_message_at: '2026-05-25T16:42:01Z',
  last_direction: 'inbound',
  labels: ['inbox', 'urgent'],
  created_at: '2026-05-20T09:14:52Z',
  updated_at: '2026-05-25T16:42:01Z',
}

describe('Bird transformTicket', () => {
  it('maps the documented thread fields and parses as a Ticket', () => {
    const t = TicketSchema.parse(transformTicket(THREAD))
    expect(t).toMatchObject({
      id: THREAD.id,
      externalId: THREAD.id,
      subject: 'Re: Your order',
      status: 'open',
      channel: 'email',
      requesterId: THREAD.contact_id,
      tagIds: ['mbx_01krdgeqcxet5s7t44vh8rt9mg:urgent'],
      createdAt: '2026-05-20T09:14:52Z',
      updatedAt: '2026-05-25T16:42:01Z',
      platform: 'reply-bird-conversations',
    })
    expect(t.metadata).toEqual({
      mailboxId: THREAD.mailbox_id,
      placement: 'inbox',
      messageCount: '3',
      unreadCount: '1',
      lastMessageAt: '2026-05-25T16:42:01Z',
      lastDirection: 'inbound',
    })
    expect(t.priority).toBeUndefined()
    expect(t.assigneeId).toBeUndefined()
  })

  it('maps the placement label to a status: archive is closed, spam and blocked unknown', () => {
    const status = (labels: string[]) =>
      TicketSchema.parse(transformTicket({ ...THREAD, labels })).status
    expect(status(['archive'])).toBe('closed')
    expect(status(['spam', 'urgent'])).toBe('unknown')
    expect(status(['blocked'])).toBe('unknown')
  })

  it('keeps no system label among the tags', () => {
    const t = transformTicket({ ...THREAD, labels: ['archive', 'unread', 'trash', 'sent', 'vip'] })
    expect(t.tagIds).toEqual(['mbx_01krdgeqcxet5s7t44vh8rt9mg:vip'])
  })

  it('a null subject and an unlinked contact become empty strings', () => {
    const t = TicketSchema.parse(transformTicket({ ...THREAD, subject: null, contact_id: null }))
    expect(t.subject).toBe('')
    expect(t.requesterId).toBe('')
  })
})
