import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawProprofsTicket,
} from '../../../../../../../src/verticals/customer-support/adapters/proprofs-help-desk/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

describe('proprofs-help-desk transformTicket', () => {
  it('maps a fully-populated open ticket', () => {
    const raw: RawProprofsTicket = {
      ticket_id: '1001',
      ticket_subject: 'Cannot reset password',
      ticket_status: 'open',
      priority: 'high',
      created_date_time: '2024-01-15T09:30:00.000Z',
      modified_date_time: '2024-02-01T14:20:00.000Z',
      customer_email: 'jane@example.com',
      customer_name: 'Jane Doe',
      customer_phone: '+14155550100',
      staff: { id: 'ST001-001', name: 'Agent Smith', email: 'agent@example.com' },
      inbox: { id: 'IB001-001', name: 'Support', email: 'support@example.com' },
      labels: [
        { id: '5', name: 'billing' },
        { id: '7', name: 'urgent' },
      ],
    }

    const result = transformTicket(raw)

    // id maps from ticket_id
    expect(result.id).toBe('1001')
    // subject maps from ticket_subject
    expect(result.subject).toBe('Cannot reset password')
    // status 'open' → 'open'
    expect(result.status).toBe('open')
    // priority 'high' → 'high'
    expect(result.priority).toBe('high')
    // channel always 'email' for ProProfs
    expect(result.channel).toBe('email')
    // requesterId maps from customer_email
    expect(result.requesterId).toBe('jane@example.com')
    // assigneeId maps from staff.id
    expect(result.assigneeId).toBe('ST001-001')
    // teamId maps from inbox.id
    expect(result.teamId).toBe('IB001-001')
    // tagIds map from labels[].id
    expect(result.tagIds).toEqual(['5', '7'])
    // platform
    expect(result.platform).toBe('proprofs-help-desk')
    // resolvedAt undefined for open ticket
    expect(result.resolvedAt).toBeUndefined()

    expect(() => TicketSchema.parse(result)).not.toThrow()
  })

  it('maps a resolved ticket — sets resolvedAt', () => {
    const raw: RawProprofsTicket = {
      ticket_id: 2002,
      ticket_subject: 'Billing question',
      ticket_status: 'resolved',
      priority: 'normal',
      created_date_time: '2024-02-10T10:00:00.000Z',
      modified_date_time: '2024-02-15T16:00:00.000Z',
      customer_email: 'bob@example.com',
    }

    const result = transformTicket(raw)

    expect(result.status).toBe('resolved')
    expect(result.priority).toBe('normal')
    // resolvedAt set to modified_date_time for resolved tickets
    expect(result.resolvedAt).toBe('2024-02-15T16:00:00.000Z')

    expect(() => TicketSchema.parse(result)).not.toThrow()
  })

  it('maps on_hold status from "hold"', () => {
    const raw: RawProprofsTicket = {
      ticket_id: '3003',
      ticket_subject: 'Waiting for customer',
      ticket_status: 'hold',
      created_date_time: '2024-03-01T08:00:00.000Z',
      customer_email: 'user@example.com',
    }

    const result = transformTicket(raw)

    expect(result.status).toBe('on_hold')

    expect(() => TicketSchema.parse(result)).not.toThrow()
  })

  it('handles missing staff/inbox/labels gracefully', () => {
    const raw: RawProprofsTicket = {
      ticket_id: '4004',
      ticket_subject: 'Test ticket',
      ticket_status: 'pending',
      priority: 'low',
      created_date_time: '2024-04-01T00:00:00.000Z',
      customer_email: 'anon@example.com',
      labels: [],
    }

    const result = transformTicket(raw)

    expect(result.status).toBe('pending')
    expect(result.priority).toBe('low')
    expect(result.assigneeId).toBeUndefined()
    expect(result.teamId).toBeUndefined()
    expect(result.tagIds).toEqual([])

    expect(() => TicketSchema.parse(result)).not.toThrow()
  })

  it('maps urgent priority correctly', () => {
    const raw: RawProprofsTicket = {
      ticket_id: '5005',
      ticket_subject: 'URGENT: System down',
      ticket_status: 'open',
      priority: 'urgent',
      created_date_time: '2024-05-01T06:00:00.000Z',
      customer_email: 'admin@example.com',
    }

    const result = transformTicket(raw)

    expect(result.priority).toBe('urgent')

    expect(() => TicketSchema.parse(result)).not.toThrow()
  })
})
