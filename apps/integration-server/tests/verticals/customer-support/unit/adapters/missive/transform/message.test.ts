import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  type RawMissiveMessage,
} from '../../../../../../../src/verticals/customer-support/adapters/missive/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

describe('missive transformMessage', () => {
  const raw: RawMissiveMessage = {
    id: 'msg-001',
    subject: 'Help with billing',
    preview: 'I cannot access my invoice.',
    type: 'email',
    draft: false,
    from_field: { name: 'Jane Doe', address: 'jane@example.com' },
    to_fields: [{ name: 'Support', address: 'support@co.example' }],
    delivered_at: 1700000000,
    attachments: [{ id: 'att-1', filename: 'invoice.pdf' }],
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformMessage(raw, 'conv-999')
    expect(result.id).toBe('msg-001')
    expect(result.externalId).toBe('msg-001')
  })

  it('sets ticketId from conversationId argument', () => {
    const result = transformMessage(raw, 'conv-999')
    expect(result.ticketId).toBe('conv-999')
  })

  it('uses from_field.address as authorId', () => {
    const result = transformMessage(raw, 'conv-999')
    expect(result.authorId).toBe('jane@example.com')
  })

  it('maps preview to body', () => {
    const result = transformMessage(raw, 'conv-999')
    expect(result.body).toBe('I cannot access my invoice.')
  })

  it('maps non-comment type to public', () => {
    const result = transformMessage(raw, 'conv-999')
    expect(result.type).toBe('public')
  })

  it('maps comment type to internal', () => {
    const comment: RawMissiveMessage = { ...raw, type: 'comment' }
    const result = transformMessage(comment, 'conv-999')
    expect(result.type).toBe('internal')
  })

  it('converts delivered_at epoch seconds to ISO-8601', () => {
    const result = transformMessage(raw, 'conv-999')
    // 1700000000 seconds = 2023-11-14T22:13:20.000Z
    expect(result.createdAt).toBe('2023-11-14T22:13:20.000Z')
  })

  it('counts attachments', () => {
    const result = transformMessage(raw, 'conv-999')
    expect(result.attachmentCount).toBe(1)
  })

  it('sets platform to missive', () => {
    const result = transformMessage(raw, 'conv-999')
    expect(result.platform).toBe('missive')
  })

  it('produces a MessageSchema-valid result', () => {
    const result = transformMessage(raw, 'conv-999')
    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('falls back to created_at ISO string when delivered_at is absent', () => {
    const noDelivery: RawMissiveMessage = {
      ...raw,
      delivered_at: undefined,
      created_at: '2024-01-01T00:00:00.000Z',
    }
    const result = transformMessage(noDelivery, 'c1')
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(() => MessageSchema.parse(result)).not.toThrow()
  })
})
