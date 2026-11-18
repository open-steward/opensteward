import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawMovideskTicket,
} from '../../../../../../../src/verticals/customer-support/adapters/movidesk/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

describe('movidesk transformTicket', () => {
  const raw: RawMovideskTicket = {
    id: 9001,
    protocol: 'TKT-9001',
    subject: 'Order not delivered',
    status: 'In attendance',
    urgency: 'High',
    origin: 1,
    createdDate: '2024-06-01T09:00:00.000Z',
    lastUpdate: '2024-06-02T11:00:00.000Z',
    resolvedIn: null,
    owner: { id: 'agent-5', businessName: 'Agent Five', profileType: 1 },
    ownerTeam: 'Support Team A',
    clients: [{ id: 'client-12', businessName: 'John Customer', profileType: 2 }],
    category: 'Logistics',
  }

  it('maps id and externalId from raw.id as string', () => {
    const result = transformTicket(raw)
    expect(result.id).toBe('9001')
    expect(result.externalId).toBe('9001')
  })

  it('uses protocol as number field when present', () => {
    const result = transformTicket(raw)
    expect(result.number).toBe('TKT-9001')
  })

  it('maps subject field', () => {
    const result = transformTicket(raw)
    expect(result.subject).toBe('Order not delivered')
  })

  it('maps "In attendance" to in_progress status', () => {
    const result = transformTicket(raw)
    expect(result.status).toBe('in_progress')
  })

  it('maps "New" to open status', () => {
    const newTicket: RawMovideskTicket = { ...raw, status: 'New' }
    const result = transformTicket(newTicket)
    expect(result.status).toBe('open')
  })

  it('maps "Resolved" to resolved status', () => {
    const resolved: RawMovideskTicket = { ...raw, status: 'Resolved' }
    const result = transformTicket(resolved)
    expect(result.status).toBe('resolved')
  })

  it('maps "Closed" to closed status', () => {
    const closed: RawMovideskTicket = { ...raw, status: 'Closed' }
    const result = transformTicket(closed)
    expect(result.status).toBe('closed')
  })

  it('maps "High" urgency to high priority', () => {
    const result = transformTicket(raw)
    expect(result.priority).toBe('high')
  })

  it('maps origin 1 (email) to email channel', () => {
    const result = transformTicket(raw)
    expect(result.channel).toBe('email')
  })

  it('maps origin 4 (chat) to chat channel', () => {
    const chat: RawMovideskTicket = { ...raw, origin: 4 }
    const result = transformTicket(chat)
    expect(result.channel).toBe('chat')
  })

  it('maps first client id to requesterId', () => {
    const result = transformTicket(raw)
    expect(result.requesterId).toBe('client-12')
  })

  it('maps owner id to assigneeId', () => {
    const result = transformTicket(raw)
    expect(result.assigneeId).toBe('agent-5')
  })

  it('maps ownerTeam string to teamId', () => {
    const result = transformTicket(raw)
    expect(result.teamId).toBe('Support Team A')
  })

  it('tagIds is always an empty array', () => {
    const result = transformTicket(raw)
    expect(result.tagIds).toEqual([])
  })

  it('maps createdDate to createdAt ISO string', () => {
    const result = transformTicket(raw)
    expect(result.createdAt).toBe('2024-06-01T09:00:00.000Z')
  })

  it('sets platform to movidesk', () => {
    const result = transformTicket(raw)
    expect(result.platform).toBe('movidesk')
  })

  it('produces a TicketSchema-valid result', () => {
    const result = transformTicket(raw)
    expect(() => TicketSchema.parse(result)).not.toThrow()
  })

  it('resolvedAt comes from resolvedIn when present', () => {
    const withResolved: RawMovideskTicket = {
      ...raw,
      resolvedIn: '2024-06-03T10:00:00.000Z',
    }
    const result = transformTicket(withResolved)
    expect(result.resolvedAt).toBe('2024-06-03T10:00:00.000Z')
  })
})
