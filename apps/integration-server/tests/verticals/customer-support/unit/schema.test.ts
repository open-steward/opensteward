import { describe, it, expect } from 'vitest'
import {
  TicketSchema,
  MessageSchema,
  ContactSchema,
  UserSchema,
  TagSchema,
  TeamSchema,
  MacroSchema,
  WebhookEventSchema,
} from '../../../../src/verticals/customer-support/schema'

describe('customer-support canonical schemas', () => {
  it('parses a minimal Ticket', () => {
    const parsed = TicketSchema.parse({
      id: 't1', externalId: 't1', subject: 'Cannot log in',
      status: 'open', channel: 'email', requesterId: 'c1',
      tagIds: [], createdAt: '2026-01-01T00:00:00.000Z',
      platform: 'zendesk', metadata: {},
    })
    expect(parsed.status).toBe('open')
    expect(parsed.channel).toBe('email')
  })

  it('Message schema includes body, no attachment-content field', () => {
    const parsed = MessageSchema.parse({
      id: 'm1', externalId: 'm1', ticketId: 't1', authorId: 'u1',
      authorType: 'user', body: 'on it', type: 'internal',
      attachmentCount: 1, createdAt: '2026-01-01T00:00:00.000Z',
      platform: 'zendesk', metadata: {},
    })
    expect(parsed.body).toBe('on it')
    expect(parsed.type).toBe('internal')
    expect((parsed as Record<string, unknown>)['attachmentContent']).toBeUndefined()
    expect((parsed as Record<string, unknown>)['voiceRecording']).toBeUndefined()
  })

  it('Contact is PII-minimal', () => {
    const parsed = ContactSchema.parse({
      id: 'c1', externalId: 'c1', email: 'alice@example.com',
      name: 'Alice', platform: 'zendesk', metadata: {},
    })
    expect(parsed.email).toBe('alice@example.com')
    expect((parsed as Record<string, unknown>)['ssn']).toBeUndefined()
    expect((parsed as Record<string, unknown>)['location']).toBeUndefined()
  })

  it('parses User / Tag / Team / Macro / WebhookEvent', () => {
    expect(UserSchema.parse({ id: 'u1', externalId: 'u1', name: 'Bob', teamIds: ['team1'], platform: 'zendesk', metadata: {} }).name).toBe('Bob')
    expect(TagSchema.parse({ id: 'tg1', externalId: 'tg1', name: 'urgent', platform: 'zendesk', metadata: {} }).name).toBe('urgent')
    expect(TeamSchema.parse({ id: 'tm1', externalId: 'tm1', name: 'Tier 1', platform: 'zendesk', metadata: {} }).name).toBe('Tier 1')
    expect(MacroSchema.parse({ id: 'mc1', externalId: 'mc1', title: 'Welcome', body: 'Hi!', platform: 'zendesk', metadata: {} }).body).toBe('Hi!')
    expect(WebhookEventSchema.parse({ platform: 'zendesk', type: 'ticket.created', resourceType: 'tickets', action: 'created', resourceId: 't1', payload: {} }).action).toBe('created')
  })
})
