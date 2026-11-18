import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  type RawProprofsMessage,
} from '../../../../../../../src/verticals/customer-support/adapters/proprofs-help-desk/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

describe('proprofs-help-desk transformMessage', () => {
  it('maps a staff reply as public user message', () => {
    const raw: RawProprofsMessage = {
      id: 'msg-100',
      message_plain_text: 'Thank you for reaching out!',
      created: '2024-01-15T09:30:00.000Z',
      from: 'agent@example.com',
      to: 'customer@example.com',
      reply_by: 'staff',
    }

    const result = transformMessage(raw, 'tkt-42', 0)

    // id maps from raw.id
    expect(result.id).toBe('msg-100')
    // ticketId passed through
    expect(result.ticketId).toBe('tkt-42')
    // authorId maps from from field
    expect(result.authorId).toBe('agent@example.com')
    // authorType: reply_by='staff' → 'user'
    expect(result.authorType).toBe('user')
    // body maps from message_plain_text
    expect(result.body).toBe('Thank you for reaching out!')
    // ProProfs has no internal notes concept — always public
    expect(result.type).toBe('public')
    // platform
    expect(result.platform).toBe('proprofs-help-desk')

    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('maps a customer reply — authorType contact', () => {
    const raw: RawProprofsMessage = {
      id: 'msg-200',
      message_plain_text: 'Still not working for me.',
      created: '2024-01-16T10:00:00.000Z',
      from: 'customer@example.com',
      reply_by: 'customer',
    }

    const result = transformMessage(raw, 'tkt-42', 1)

    expect(result.authorType).toBe('contact')
    expect(result.type).toBe('public')
    // id maps from raw.id when present
    expect(result.id).toBe('msg-200')

    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('derives surrogate id from ticketId+index when no id field', () => {
    const raw: RawProprofsMessage = {
      message_plain_text: 'Auto-generated reply',
      created: '2024-01-17T08:00:00.000Z',
      from: 'system@example.com',
      reply_by: 'agent',
    }

    const result = transformMessage(raw, 'tkt-99', 3)

    // surrogate id = ticketId:msg:index
    expect(result.id).toBe('tkt-99:msg:3')
    expect(result.externalId).toBe('tkt-99:msg:3')
    // reply_by 'agent' → authorType 'user'
    expect(result.authorType).toBe('user')

    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('falls back to epoch when created is absent', () => {
    const raw: RawProprofsMessage = {
      id: 'msg-300',
      message_plain_text: 'No timestamp',
      from: 'x@example.com',
    }

    const result = transformMessage(raw, 'tkt-1', 0)

    expect(result.createdAt).toBe(new Date(0).toISOString())

    expect(() => MessageSchema.parse(result)).not.toThrow()
  })
})
