import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  type RawLibredeskMessage,
} from '../../../../../../../src/verticals/customer-support/adapters/libredesk/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

describe('libredesk transformMessage', () => {
  it('maps private=true to type internal', () => {
    const raw: RawLibredeskMessage = { id: 1, private: true, sender_id: 5 }
    const result = transformMessage(raw, 'conv-1')
    expect(result.type).toBe('internal')
  })

  it('maps private=false to type public', () => {
    const raw: RawLibredeskMessage = { id: 2, private: false, sender_id: 5 }
    const result = transformMessage(raw, 'conv-1')
    expect(result.type).toBe('public')
  })

  it('maps sender_type agent to authorType user', () => {
    const raw: RawLibredeskMessage = { id: 3, sender_type: 'agent', sender_id: 10 }
    const result = transformMessage(raw, 'conv-1')
    expect(result.authorType).toBe('user')
  })

  it('maps sender_type contact to authorType contact', () => {
    const raw: RawLibredeskMessage = { id: 4, sender_type: 'contact', sender_id: 20 }
    const result = transformMessage(raw, 'conv-1')
    expect(result.authorType).toBe('contact')
  })

  it('prefers uuid as externalId over id', () => {
    const raw: RawLibredeskMessage = { id: 5, uuid: 'msg-uuid-abc', sender_id: 1 }
    const result = transformMessage(raw, 'conv-1')
    expect(result.externalId).toBe('msg-uuid-abc')
    expect(result.id).toBe('5')
  })

  it('prefers text_content over content for body', () => {
    const raw: RawLibredeskMessage = {
      id: 6,
      text_content: 'Plain text',
      content: '<p>HTML</p>',
      sender_id: 1,
    }
    const result = transformMessage(raw, 'conv-1')
    expect(result.body).toBe('Plain text')
  })

  it('falls back to content when text_content absent', () => {
    const raw: RawLibredeskMessage = { id: 7, content: '<p>Only HTML</p>', sender_id: 1 }
    const result = transformMessage(raw, 'conv-1')
    expect(result.body).toBe('<p>Only HTML</p>')
  })

  it('counts attachments from attachments array', () => {
    const raw: RawLibredeskMessage = { id: 8, attachments: [{}, {}], sender_id: 1 }
    const result = transformMessage(raw, 'conv-1')
    expect(result.attachmentCount).toBe(2)
  })

  it('sets ticketId from conversationId argument', () => {
    const raw: RawLibredeskMessage = { id: 9, sender_id: 1 }
    const result = transformMessage(raw, 'conv-abc')
    expect(result.ticketId).toBe('conv-abc')
  })

  it('sets platform to libredesk', () => {
    const raw: RawLibredeskMessage = { id: 10, sender_id: 1 }
    const result = transformMessage(raw, 'conv-1')
    expect(result.platform).toBe('libredesk')
  })

  it('MessageSchema validates authorType user for sender_type agent', () => {
    const raw: RawLibredeskMessage = { id: 11, sender_type: 'agent', sender_id: 5 }
    const result = transformMessage(raw, 'conv-1')
    expect(result.authorType).toBe('user')
    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('MessageSchema validates a public contact message', () => {
    const raw: RawLibredeskMessage = {
      id: 99,
      sender_id: 5,
      sender_type: 'contact',
      private: false,
      text_content: 'Valid message',
      created_at: '2026-01-15T09:30:00.000Z',
    }
    const result = transformMessage(raw, 'conv-99')
    expect(() => MessageSchema.parse(result)).not.toThrow()
  })
})
