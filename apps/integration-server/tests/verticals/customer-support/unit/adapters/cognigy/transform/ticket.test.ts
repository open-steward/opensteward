import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawCognigyConversation,
} from '../../../../../../../src/verticals/customer-support/adapters/cognigy/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

describe('cognigy transformTicket', () => {
  const raw: RawCognigyConversation = {
    id: 77,
    status: 'open',
    priority: 'high',
    channel: 'Channel::WebWidget',
    inbox_id: 3,
    labels: ['billing', 'urgent'],
    created_at: 1_700_000_000, // Unix epoch seconds
    updated_at: 1_700_001_000,
    meta: {
      sender: { id: 55, name: 'Carlos Rivera', email: 'carlos@example.com' },
      assignee: { id: 10 },
      team: { id: 12 },
    },
  }

  it('maps id to string', () => {
    const out = transformTicket(raw)
    expect(out.id).toBe('77')
  })

  it('maps number to string id', () => {
    const out = transformTicket(raw)
    expect(out.number).toBe('77')
  })

  it('maps open status → open', () => {
    const out = transformTicket(raw)
    expect(out.status).toBe('open')
  })

  it('maps snoozed status → on_hold', () => {
    const out = transformTicket({ ...raw, status: 'snoozed' })
    expect(out.status).toBe('on_hold')
  })

  it('maps resolved status → resolved', () => {
    const out = transformTicket({ ...raw, status: 'resolved' })
    expect(out.status).toBe('resolved')
  })

  it('maps pending status → pending', () => {
    const out = transformTicket({ ...raw, status: 'pending' })
    expect(out.status).toBe('pending')
  })

  it('maps high priority → high', () => {
    const out = transformTicket(raw)
    expect(out.priority).toBe('high')
  })

  it('maps medium priority → normal', () => {
    const out = transformTicket({ ...raw, priority: 'medium' })
    expect(out.priority).toBe('normal')
  })

  it('maps Channel::WebWidget → chat channel', () => {
    const out = transformTicket(raw)
    expect(out.channel).toBe('chat')
  })

  it('maps Channel::Email → email channel', () => {
    const out = transformTicket({ ...raw, channel: 'Channel::Email' })
    expect(out.channel).toBe('email')
  })

  it('maps Channel::Api → api channel', () => {
    const out = transformTicket({ ...raw, channel: 'Channel::Api' })
    expect(out.channel).toBe('api')
  })

  it('maps requesterId from meta.sender.id', () => {
    const out = transformTicket(raw)
    expect(out.requesterId).toBe('55')
  })

  it('maps assigneeId from meta.assignee.id', () => {
    const out = transformTicket(raw)
    expect(out.assigneeId).toBe('10')
  })

  it('maps teamId from meta.team.id', () => {
    const out = transformTicket(raw)
    expect(out.teamId).toBe('12')
  })

  it('maps tagIds from labels array', () => {
    const out = transformTicket(raw)
    expect(out.tagIds).toEqual(['billing', 'urgent'])
  })

  it('uses sender name as subject', () => {
    const out = transformTicket(raw)
    expect(out.subject).toBe('Carlos Rivera')
  })

  it('synthesises subject from id when sender name is absent', () => {
    const out = transformTicket({ ...raw, meta: {} })
    expect(out.subject).toBe('Conversation #77')
  })

  it('converts Unix epoch seconds to ISO-8601 createdAt', () => {
    const out = transformTicket(raw)
    expect(out.createdAt).toBe(new Date(1_700_000_000 * 1000).toISOString())
  })

  it('sets resolvedAt for resolved conversations', () => {
    const out = transformTicket({ ...raw, status: 'resolved' })
    expect(out.resolvedAt).toBeDefined()
  })

  it('does not set resolvedAt for open conversations', () => {
    const out = transformTicket(raw)
    expect(out.resolvedAt).toBeUndefined()
  })

  it('sets platform to cognigy', () => {
    const out = transformTicket(raw)
    expect(out.platform).toBe('cognigy')
  })

  it('stores inboxId in metadata', () => {
    const out = transformTicket(raw)
    expect(out.metadata.inboxId).toBe('3')
  })

  it('passes TicketSchema.parse', () => {
    const out = transformTicket(raw)
    expect(() => TicketSchema.parse(out)).not.toThrow()
  })
})
