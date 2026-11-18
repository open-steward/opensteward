/**
 * Bird thread message → canonical Message.
 *
 * Fixture: an `EmailThreadMessage` (https://bird.com/openapi.json, items of
 * `GET /v1/email/threads/{thread_id}/messages`) with its required fields, using
 * the spec's examples: id "rem_01krdgeqcxet5s7t44vh8rt9mg", labels
 * ["inbox", "unread"], subject "Re: Your order", attachment "invoice.pdf"
 * (application/pdf), source.resource "/v1/email/inbound-messages/rem_01krdgeqcxet5s7t44vh8rt9mg".
 */
import { describe, it, expect } from 'vitest'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'
import {
  transformMessage,
  type RawBirdThreadMessage,
} from '../../../../../../../src/verticals/customer-support/adapters/reply-bird-conversations/transform/message'

const INBOUND: RawBirdThreadMessage & Record<string, unknown> = {
  id: 'rem_01krdgeqcxet5s7t44vh8rt9mg',
  direction: 'inbound',
  channel: 'email',
  thread_id: 'thr_01krdgeqcxet5s7t44vh8rt9mg',
  from: 'billing@acme.com',
  to: ['concierge@inbox.ai'],
  cc: [],
  delivered_to: null,
  subject: 'Re: Your order',
  preview: 'Confirming your order shipped',
  extracted_text: 'Confirming your order shipped.',
  labels: ['inbox', 'unread'],
  status: null,
  authentication: 'unknown',
  spf_pass: true,
  dkim_pass: true,
  dmarc_pass: null,
  attachment_count: 1,
  attachment_manifest: [
    {
      id: 'rea_01krdgeqcxet5s7t44vh8rt9mg',
      filename: 'invoice.pdf',
      content_type: 'application/pdf',
      size: 1024,
    },
  ],
  reference_ids: [],
  contact_id: 'con_01krdgeqcxet5s7t44vh8rt9mg',
  recipients: null,
  purge_at: '2027-05-25T16:42:01Z',
  source: {
    resource: '/v1/email/inbound-messages/rem_01krdgeqcxet5s7t44vh8rt9mg',
    available_until: '2026-06-24T16:42:01Z',
  },
  occurred_at: '2026-05-25T16:42:01Z',
}

describe('Bird transformMessage', () => {
  it('maps an inbound message to the contact that sent it', () => {
    const m = MessageSchema.parse(transformMessage(INBOUND))
    expect(m).toMatchObject({
      id: INBOUND.id,
      externalId: INBOUND.id,
      ticketId: INBOUND.thread_id,
      authorId: 'con_01krdgeqcxet5s7t44vh8rt9mg',
      authorType: 'contact',
      body: 'Confirming your order shipped.',
      type: 'public',
      attachmentCount: 1,
      createdAt: '2026-05-25T16:42:01Z',
      platform: 'reply-bird-conversations',
    })
    expect(m.metadata).toEqual({ direction: 'inbound', from: 'billing@acme.com' })
  })

  it('an outbound message has no documented author: type unknown, id empty, delivery status kept', () => {
    const m = MessageSchema.parse(
      transformMessage({
        ...INBOUND,
        id: 'em_01krdgeqcxet5s7t44vh8rt9mg',
        direction: 'outbound',
        from: 'concierge@inbox.ai',
        status: 'delivered',
        contact_id: 'con_01krdgeqcxet5s7t44vh8rt9mg',
      }),
    )
    expect(m.authorType).toBe('unknown')
    expect(m.authorId).toBe('')
    expect(m.metadata['deliveryStatus']).toBe('delivered')
  })

  it('an unlinked inbound sender and null extracted text become empty strings', () => {
    const m = MessageSchema.parse(
      transformMessage({ ...INBOUND, contact_id: null, extracted_text: null }),
    )
    expect(m.authorId).toBe('')
    expect(m.body).toBe('')
  })
})
