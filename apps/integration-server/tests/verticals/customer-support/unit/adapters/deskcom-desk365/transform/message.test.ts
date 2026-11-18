/**
 * Fixture: the documented ConversationMessageModel of the Desk365 v3 spec
 * (https://apps.desk365.io/apis/v3/api-docs?group=v3), using its own example
 * values. GET /v3/tickets/conversations returns
 * `{ count, ..., conversations: ConversationMessageModel[] }`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  type RawDesk365Conversation,
} from '../../../../../../../src/verticals/customer-support/adapters/deskcom-desk365/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

describe('deskcom-desk365 transformMessage', () => {
  const raw: RawDesk365Conversation = {
    id: 34372256829,
    ticket_number: 10,
    created_by: 'test@example.com',
    creator_name: 'Test User',
    sender_type: 'agent',
    cc_address: 'cc1@example.com,cc2@example.com',
    bcc_address: 'bcc1@example.com,bcc2@example.com',
    to_address: 'to@example.com',
    notified_agents: 'agent1@example.com,agent2@example.com',
    body: '<p>This is the message body<p>',
    body_text: 'This is the message body',
    attachments_count: 2,
    attachments: [],
    created_on: '2023-10-01 12:34:56',
    is_email_deliveribility_failiure: true,
    email_bounce_type: 'permanent',
    email_bounce_status: '5.4.1',
  }

  it('parses against the canonical MessageSchema', () => {
    expect(() => MessageSchema.parse(transformMessage(raw, '10', 'public'))).not.toThrow()
  })

  it('uses the documented conversation id', () => {
    const out = transformMessage(raw, '10', 'public')
    expect(out.id).toBe('34372256829')
    expect(out.externalId).toBe('34372256829')
    expect(out.ticketId).toBe('10')
  })

  it('reads body_text, created_by and attachments_count', () => {
    const out = transformMessage(raw, '10', 'public')
    expect(out.body).toBe('This is the message body')
    expect(out.authorId).toBe('test@example.com')
    expect(out.attachmentCount).toBe(2)
    expect(out.metadata).toEqual({ creatorName: 'Test User' })
  })

  it('reads created_on as UTC', () => {
    expect(transformMessage(raw, '10', 'public').createdAt).toBe('2023-10-01T12:34:56.000Z')
  })

  it('reads created_on as UTC even when the process runs in a non-UTC zone', () => {
    // vitest.config.ts pins TZ=UTC, where local time and UTC agree. Node
    // re-reads process.env.TZ on assignment, so force a zone with an offset.
    const saved = process.env.TZ
    try {
      process.env.TZ = 'America/New_York'
      expect(new Date(2023, 9, 1, 12).getTimezoneOffset()).not.toBe(0)
      expect(transformMessage(raw, '10', 'public').createdAt).toBe('2023-10-01T12:34:56.000Z')
    } finally {
      process.env.TZ = saved
    }
  })

  it('reads body only from body_text, never the HTML body', () => {
    const { body_text: _t, ...noText } = raw
    expect(transformMessage(noText, '10', 'public').body).toBe('')
  })

  it('maps sender_type agent → user and contact → contact; anything else is unknown', () => {
    expect(transformMessage(raw, '10', 'public').authorType).toBe('user')
    expect(transformMessage({ ...raw, sender_type: 'contact' }, '10', 'public').authorType).toBe(
      'contact',
    )
    expect(transformMessage({ ...raw, sender_type: 'bot' }, '10', 'public').authorType).toBe(
      'unknown',
    )
  })

  it('takes the message type from the caller', () => {
    expect(transformMessage(raw, '10', 'internal').type).toBe('internal')
    expect(transformMessage(raw, '10', 'public').type).toBe('public')
  })

  it('throws without created_by, the documented author', () => {
    const { created_by: _c, ...noAuthor } = raw
    expect(() => transformMessage(noAuthor, '10', 'public')).toThrow(/created_by/)
  })

  it('throws without a documented id or a readable created_on', () => {
    const { id: _id, ...noId } = raw
    expect(() => transformMessage(noId, '10', 'public')).toThrow(/id/)
    expect(() => transformMessage({ ...raw, created_on: undefined }, '10', 'public')).toThrow(
      /created_on/,
    )
  })
})
