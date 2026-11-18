import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawInvGateIncident,
} from '../../../../../../../src/verticals/customer-support/adapters/helpcrunch-na/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

describe('helpcrunch-na transformTicket', () => {
  const raw: RawInvGateIncident = {
    id: 9001,
    pretty_id: 'INC-9001',
    title: 'VPN not connecting after update',
    description: 'Details here',
    status_id: 1, // open
    priority_id: 3, // high
    type_id: 1,
    source_id: 2,
    category_id: 5,
    user_id: 77,
    creator_id: 12,
    assigned_id: 42,
    assigned_group_id: 8,
    created_at: '2024-07-01T08:00:00.000Z',
    last_update: '2024-07-02T16:00:00.000Z',
    solved_at: null,
    closed_at: null,
    rating: 4,
  }

  it('maps id to string id and externalId', () => {
    const result = transformTicket(raw)
    expect(result.id).toBe('9001')
    expect(result.externalId).toBe('9001')
  })

  it('maps pretty_id to number field', () => {
    const result = transformTicket(raw)
    expect(result.number).toBe('INC-9001')
  })

  it('maps title to subject', () => {
    const result = transformTicket(raw)
    expect(result.subject).toBe('VPN not connecting after update')
  })

  it('maps status_id 1 to open', () => {
    const result = transformTicket(raw)
    expect(result.status).toBe('open')
  })

  it('maps status_id 2 to closed', () => {
    const closed: RawInvGateIncident = {
      ...raw,
      status_id: 2,
      closed_at: '2024-07-03T10:00:00.000Z',
    }
    const result = transformTicket(closed)
    expect(result.status).toBe('closed')
  })

  it('maps status_id 3 to pending', () => {
    const pending: RawInvGateIncident = { ...raw, status_id: 3 }
    const result = transformTicket(pending)
    expect(result.status).toBe('pending')
  })

  it('maps status_id 4 to on_hold', () => {
    const onHold: RawInvGateIncident = { ...raw, status_id: 4 }
    const result = transformTicket(onHold)
    expect(result.status).toBe('on_hold')
  })

  it('maps priority_id 3 to high', () => {
    const result = transformTicket(raw)
    expect(result.priority).toBe('high')
  })

  it('maps priority_id 1 to low', () => {
    const lowPriority: RawInvGateIncident = { ...raw, priority_id: 1 }
    const result = transformTicket(lowPriority)
    expect(result.priority).toBe('low')
  })

  it('maps priority_id 4 to urgent', () => {
    const urgent: RawInvGateIncident = { ...raw, priority_id: 4 }
    const result = transformTicket(urgent)
    expect(result.priority).toBe('urgent')
  })

  it('sets channel to other', () => {
    const result = transformTicket(raw)
    expect(result.channel).toBe('other')
  })

  it('maps user_id to requesterId', () => {
    const result = transformTicket(raw)
    expect(result.requesterId).toBe('77')
  })

  it('maps assigned_id to assigneeId', () => {
    const result = transformTicket(raw)
    expect(result.assigneeId).toBe('42')
  })

  it('maps assigned_group_id to teamId', () => {
    const result = transformTicket(raw)
    expect(result.teamId).toBe('8')
  })

  it('maps rating to satisfactionRating', () => {
    const result = transformTicket(raw)
    expect(result.satisfactionRating).toBe(4)
  })

  it('sets resolvedAt when closed', () => {
    const closed: RawInvGateIncident = {
      ...raw,
      status_id: 2,
      closed_at: '2024-07-03T10:00:00.000Z',
    }
    const result = transformTicket(closed)
    expect(result.resolvedAt).toBeDefined()
  })

  it('does not set resolvedAt when open', () => {
    const result = transformTicket(raw)
    expect(result.resolvedAt).toBeUndefined()
  })

  it('sets platform to helpcrunch-na', () => {
    const result = transformTicket(raw)
    expect(result.platform).toBe('helpcrunch-na')
  })

  it('produces a TicketSchema-valid result', () => {
    const result = transformTicket(raw)
    expect(() => TicketSchema.parse(result)).not.toThrow()
  })

  it('handles minimal input', () => {
    const minimal: RawInvGateIncident = { id: 1 }
    const result = transformTicket(minimal)
    expect(result.id).toBe('1')
    expect(result.status).toBe('open')
    expect(() => TicketSchema.parse(result)).not.toThrow()
  })
})
