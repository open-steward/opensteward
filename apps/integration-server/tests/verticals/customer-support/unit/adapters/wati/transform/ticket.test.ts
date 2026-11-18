import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawWatiConversation,
} from '../../../../../../../src/verticals/customer-support/adapters/wati/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

describe('transformTicket', () => {
  it('maps a full WATI conversation to a Ticket with platform=wati', () => {
    const raw: RawWatiConversation = {
      ticket_id: 'tkt-1',
      conversation_id: 'conv-1',
      wa_id: '14155550100',
      contact_name: 'Alice',
      status: 'open',
      assigned_id: 'op-42',
      operator_name: 'Charlie',
      created: '2026-01-15T09:00:00Z',
      last_updated: '2026-02-01T12:00:00Z',
    }
    const ticket = transformTicket(raw)

    expect(ticket.id).toBe('tkt-1')
    expect(ticket.externalId).toBe('tkt-1')
    expect(ticket.platform).toBe('wati')
    expect(ticket.status).toBe('open')
    expect(ticket.channel).toBe('chat')
    expect(ticket.requesterId).toBe('14155550100')
    expect(ticket.assigneeId).toBe('op-42')
    expect(ticket.subject).toBe('Alice')
    expect(ticket.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(ticket.metadata['waId']).toBe('14155550100')
    expect(ticket.metadata['operatorName']).toBe('Charlie')
    expect(ticket.metadata['rawStatus']).toBe('open')
  })

  it('maps status=resolved to TicketStatus=resolved with resolvedAt', () => {
    const raw: RawWatiConversation = {
      ticket_id: 'tkt-2',
      status: 'resolved',
      last_updated: '2026-02-01T12:00:00Z',
    }
    const ticket = transformTicket(raw)
    expect(ticket.status).toBe('resolved')
    expect(ticket.resolvedAt).toBeDefined()
    expect(ticket.resolvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('maps status=solved (alias) to resolved', () => {
    const raw: RawWatiConversation = { ticket_id: 'tkt-3', status: 'solved' }
    const ticket = transformTicket(raw)
    expect(ticket.status).toBe('resolved')
  })

  it('maps status=closed to TicketStatus=closed with resolvedAt', () => {
    const raw: RawWatiConversation = {
      ticket_id: 'tkt-4',
      status: 'closed',
      last_updated: '2026-02-01T14:00:00Z',
    }
    const ticket = transformTicket(raw)
    expect(ticket.status).toBe('closed')
    expect(ticket.resolvedAt).toBeDefined()
  })

  it('maps status=pending to TicketStatus=pending without resolvedAt', () => {
    const raw: RawWatiConversation = { ticket_id: 'tkt-5', status: 'pending' }
    const ticket = transformTicket(raw)
    expect(ticket.status).toBe('pending')
    expect(ticket.resolvedAt).toBeUndefined()
  })

  it('defaults unknown status to open', () => {
    const raw: RawWatiConversation = { ticket_id: 'tkt-6', status: 'unknown_state' }
    const ticket = transformTicket(raw)
    expect(ticket.status).toBe('open')
  })

  it('falls back to conversation_id when ticket_id absent', () => {
    const raw: RawWatiConversation = { conversation_id: 'conv-99' }
    const ticket = transformTicket(raw)
    expect(ticket.id).toBe('conv-99')
  })

  it('uses wa_id as subject fallback when contact_name absent', () => {
    const raw: RawWatiConversation = { ticket_id: 'tkt-7', wa_id: '447700900123' }
    const ticket = transformTicket(raw)
    expect(ticket.subject).toBe('447700900123')
  })

  it('passes TicketSchema.parse without throwing', () => {
    const raw: RawWatiConversation = {
      ticket_id: 'tkt-8',
      wa_id: '14155550100',
      contact_name: 'Diana',
      status: 'open',
      created: '2026-01-15T09:00:00Z',
    }
    const ticket = transformTicket(raw)
    expect(() => TicketSchema.parse(ticket)).not.toThrow()
  })
})
