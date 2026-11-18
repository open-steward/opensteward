import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawZnunyTicket,
} from '../../../../../../../src/verticals/customer-support/adapters/znuny/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

describe('transformTicket', () => {
  it('maps a full Znuny ticket to a Ticket with platform=znuny', () => {
    const raw: RawZnunyTicket = {
      TicketID: '1001',
      TicketNumber: '2026011500001001',
      Title: 'Cannot reset password',
      State: 'open',
      StateType: 'open',
      Priority: '3 normal',
      Queue: 'Support',
      QueueID: '5',
      CustomerUserID: 'user@example.com',
      CustomerID: 'acme-corp',
      OwnerID: '42',
      Owner: 'Charlie',
      Type: 'email',
      Created: '2026-01-15 09:00:00',
      Changed: '2026-02-01 12:00:00',
    }
    const ticket = transformTicket(raw)

    expect(ticket.id).toBe('1001')
    expect(ticket.externalId).toBe('1001')
    expect(ticket.number).toBe('2026011500001001')
    expect(ticket.platform).toBe('znuny')
    expect(ticket.subject).toBe('Cannot reset password')
    expect(ticket.status).toBe('open')
    expect(ticket.priority).toBe('normal')
    expect(ticket.channel).toBe('email')
    expect(ticket.requesterId).toBe('user@example.com')
    expect(ticket.assigneeId).toBe('42')
    expect(ticket.teamId).toBe('5')
    expect(ticket.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(ticket.updatedAt).toBeDefined()
    expect(ticket.metadata['queue']).toBe('Support')
    expect(ticket.metadata['owner']).toBe('Charlie')
    expect(ticket.metadata['state']).toBe('open')
  })

  it('maps StateType=new to status=open', () => {
    const raw: RawZnunyTicket = { TicketID: '1002', StateType: 'new', State: 'new' }
    const ticket = transformTicket(raw)
    expect(ticket.status).toBe('open')
  })

  it('maps State=pending reminder to status=pending', () => {
    const raw: RawZnunyTicket = {
      TicketID: '1003',
      State: 'pending reminder',
      StateType: 'pending',
    }
    const ticket = transformTicket(raw)
    expect(ticket.status).toBe('pending')
    expect(ticket.resolvedAt).toBeUndefined()
  })

  it('maps State=closed successful to status=closed with resolvedAt', () => {
    const raw: RawZnunyTicket = {
      TicketID: '1004',
      State: 'closed successful',
      StateType: 'closed',
      Changed: '2026-02-01 14:00:00',
    }
    const ticket = transformTicket(raw)
    expect(ticket.status).toBe('closed')
    expect(ticket.resolvedAt).toBeDefined()
    expect(ticket.resolvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('maps Priority=1 very low to low', () => {
    const raw: RawZnunyTicket = { TicketID: '1005', Priority: '1 very low' }
    const ticket = transformTicket(raw)
    expect(ticket.priority).toBe('low')
  })

  it('maps Priority=4 high to high', () => {
    const raw: RawZnunyTicket = { TicketID: '1006', Priority: '4 high' }
    const ticket = transformTicket(raw)
    expect(ticket.priority).toBe('high')
  })

  it('maps Priority=5 very high to urgent', () => {
    const raw: RawZnunyTicket = { TicketID: '1007', Priority: '5 very high' }
    const ticket = transformTicket(raw)
    expect(ticket.priority).toBe('urgent')
  })

  it('maps Type=chat to channel=chat', () => {
    const raw: RawZnunyTicket = { TicketID: '1008', Type: 'chat' }
    const ticket = transformTicket(raw)
    expect(ticket.channel).toBe('chat')
  })

  it('maps Type=phone to channel=voice', () => {
    const raw: RawZnunyTicket = { TicketID: '1009', Type: 'phone' }
    const ticket = transformTicket(raw)
    expect(ticket.channel).toBe('voice')
  })

  it('maps absent Type to channel=other', () => {
    const raw: RawZnunyTicket = { TicketID: '1010' }
    const ticket = transformTicket(raw)
    expect(ticket.channel).toBe('other')
  })

  it('falls back to CustomerID when CustomerUserID absent', () => {
    const raw: RawZnunyTicket = { TicketID: '1011', CustomerID: 'acme' }
    const ticket = transformTicket(raw)
    expect(ticket.requesterId).toBe('acme')
  })

  it('handles missing optional fields without throwing', () => {
    const raw: RawZnunyTicket = { TicketID: 999 }
    const ticket = transformTicket(raw)
    expect(ticket.id).toBe('999')
    expect(ticket.subject).toBe('')
    expect(ticket.status).toBe('open')
    expect(ticket.priority).toBeUndefined()
    expect(ticket.assigneeId).toBeUndefined()
    expect(ticket.tagIds).toEqual([])
  })

  it('passes TicketSchema.parse without throwing', () => {
    const raw: RawZnunyTicket = {
      TicketID: '2000',
      TicketNumber: '2026021500002000',
      Title: 'Parse test',
      State: 'open',
      StateType: 'open',
      Priority: '3 normal',
      CustomerUserID: 'tester@example.com',
      Type: 'email',
      Created: '2026-01-15 09:00:00',
      Changed: '2026-02-01 12:00:00',
    }
    const ticket = transformTicket(raw)
    expect(() => TicketSchema.parse(ticket)).not.toThrow()
  })
})
