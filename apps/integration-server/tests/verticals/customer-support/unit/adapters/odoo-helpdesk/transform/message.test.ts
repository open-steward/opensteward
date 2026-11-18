/** mail.message rows on helpdesk.ticket; fields from addons/mail/models/mail_message.py, 14.0 and 19.0. */
import { describe, expect, it } from 'vitest'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema'
import {
  transformMessage,
  type MessageContext,
} from '../../../../../../../src/verticals/customer-support/adapters/odoo-helpdesk/transform/message'

const ctx: MessageContext = {
  internalSubtypes: new Set([2]),
  agentByPartner: new Map([[3, 2]]),
}

const base = {
  id: 55,
  body: '<p>Hello,</p><p>I received my bike &amp; it was damaged.</p>',
  model: 'helpdesk.ticket',
  res_id: 7,
  message_type: 'email',
  subtype_id: [1, 'Discussions'] as [number, string],
  is_internal: false,
  author_id: [17, 'May J. Cooper'] as [number, string],
  attachment_ids: [101, 102],
  date: '2026-01-01 09:30:00',
}

describe('odoo-helpdesk transformMessage', () => {
  it('maps a customer email as a public contact message', () => {
    const m = MessageSchema.parse(transformMessage(base, ctx))
    expect(m).toMatchObject({
      id: '55',
      externalId: '55',
      ticketId: '7',
      authorId: '17',
      authorType: 'contact',
      body: 'Hello,\nI received my bike & it was damaged.',
      type: 'public',
      attachmentCount: 2,
      createdAt: '2026-01-01T09:30:00.000Z',
      platform: 'odoo-helpdesk',
    })
    expect(m.metadata).toEqual({
      messageType: 'email',
      subtype: 'Discussions',
      authorPartnerId: '17',
    })
  })

  it("an internal user's partner is the user", () => {
    const m = MessageSchema.parse(
      transformMessage({ ...base, message_type: 'comment', author_id: [3, 'Mitchell Admin'] }, ctx),
    )
    expect(m.authorType).toBe('user')
    expect(m.authorId).toBe('2')
    expect(m.metadata['authorPartnerId']).toBe('3')
  })

  it('is internal when is_internal is set', () => {
    expect(MessageSchema.parse(transformMessage({ ...base, is_internal: true }, ctx)).type).toBe(
      'internal',
    )
  })

  it('is internal when the subtype is internal (a log note)', () => {
    const m = transformMessage({ ...base, subtype_id: [2, 'Note'] }, ctx)
    expect(MessageSchema.parse(m).type).toBe('internal')
  })

  it('is internal without a subtype', () => {
    expect(MessageSchema.parse(transformMessage({ ...base, subtype_id: false }, ctx)).type).toBe(
      'internal',
    )
  })

  it('a message without an author partner has an unknown author', () => {
    const m = MessageSchema.parse(transformMessage({ ...base, author_id: false }, ctx))
    expect(m.authorType).toBe('unknown')
    expect(m.authorId).toBe('')
  })

  it('tolerates every optional field missing', () => {
    const m = MessageSchema.parse(transformMessage({ id: 9 }, ctx))
    expect(m).toMatchObject({
      id: '9',
      ticketId: '',
      body: '',
      type: 'internal',
      authorType: 'unknown',
      createdAt: '1970-01-01T00:00:00.000Z',
    })
    expect(m.attachmentCount).toBeUndefined()
    expect(m.metadata).toEqual({})
  })
})
