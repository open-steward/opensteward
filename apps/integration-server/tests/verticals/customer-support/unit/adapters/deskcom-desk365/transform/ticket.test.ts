import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawDesk365Ticket,
} from '../../../../../../../src/verticals/customer-support/adapters/deskcom-desk365/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

describe('deskcom-desk365 transformTicket', () => {
  const raw: RawDesk365Ticket = {
    TicketNumber: 1001,
    ContactEmail: 'dana@example.com',
    ContactName: 'Dana Lee',
    Subject: 'Cannot access my account',
    Status: 'Open',
    Priority: 10, // High
    Source: 1, // Email
    Agent: 'agent@example.com',
    Group: 'Level 1 Support',
    Category: 'Access',
    Subcategory: 'Login',
    CreatedOn: '2026-01-15 09:30:00',
    UpdatedOn: '2026-01-16 14:00:00',
    ResolvedOn: null,
    ClosedOn: null,
    SurveyRating: 4,
  }

  it('maps id from TicketNumber', () => {
    const out = transformTicket(raw)
    expect(out.id).toBe('1001')
  })

  it('maps number from TicketNumber', () => {
    const out = transformTicket(raw)
    expect(out.number).toBe('1001')
  })

  it('maps subject from Subject', () => {
    const out = transformTicket(raw)
    expect(out.subject).toBe('Cannot access my account')
  })

  it('maps Open status → open', () => {
    const out = transformTicket(raw)
    expect(out.status).toBe('open')
  })

  it('maps Resolved status → resolved', () => {
    const out = transformTicket({ ...raw, Status: 'Resolved' })
    expect(out.status).toBe('resolved')
  })

  it('maps Closed status → closed', () => {
    const out = transformTicket({ ...raw, Status: 'Closed' })
    expect(out.status).toBe('closed')
  })

  it('maps Pending status → pending', () => {
    const out = transformTicket({ ...raw, Status: 'Pending' })
    expect(out.status).toBe('pending')
  })

  it('maps In Progress status → in_progress', () => {
    const out = transformTicket({ ...raw, Status: 'In Progress' })
    expect(out.status).toBe('in_progress')
  })

  it('maps Priority 10 → high', () => {
    const out = transformTicket(raw)
    expect(out.priority).toBe('high')
  })

  it('maps Priority 1 → low', () => {
    const out = transformTicket({ ...raw, Priority: 1 })
    expect(out.priority).toBe('low')
  })

  it('maps Priority 5 → normal', () => {
    const out = transformTicket({ ...raw, Priority: 5 })
    expect(out.priority).toBe('normal')
  })

  it('maps Priority 20 → urgent', () => {
    const out = transformTicket({ ...raw, Priority: 20 })
    expect(out.priority).toBe('urgent')
  })

  it('maps Source 1 (Email) → email channel', () => {
    const out = transformTicket(raw)
    expect(out.channel).toBe('email')
  })

  it('maps Source 7 (Phone) → voice channel', () => {
    const out = transformTicket({ ...raw, Source: 7 })
    expect(out.channel).toBe('voice')
  })

  it('maps Source 15 (API) → api channel', () => {
    const out = transformTicket({ ...raw, Source: 15 })
    expect(out.channel).toBe('api')
  })

  it('maps requesterId from ContactEmail', () => {
    const out = transformTicket(raw)
    expect(out.requesterId).toBe('dana@example.com')
  })

  it('maps assigneeId from Agent email', () => {
    const out = transformTicket(raw)
    expect(out.assigneeId).toBe('agent@example.com')
  })

  it('maps teamId from Group name', () => {
    const out = transformTicket(raw)
    expect(out.teamId).toBe('Level 1 Support')
  })

  it('maps satisfactionRating from SurveyRating', () => {
    const out = transformTicket(raw)
    expect(out.satisfactionRating).toBe(4)
  })

  it('parses Desk365 date format (yyyy-mm-dd hh:mm:ss) for createdAt', () => {
    const out = transformTicket(raw)
    expect(out.createdAt).toBe('2026-01-15T09:30:00.000Z')
  })

  it('parses updatedAt from UpdatedOn', () => {
    const out = transformTicket(raw)
    expect(out.updatedAt).toBe('2026-01-16T14:00:00.000Z')
  })

  it('maps resolvedAt from ResolvedOn when present', () => {
    const out = transformTicket({ ...raw, ResolvedOn: '2026-01-20 10:00:00' })
    expect(out.resolvedAt).toBe('2026-01-20T10:00:00.000Z')
  })

  it('maps closedAt from ClosedOn when present', () => {
    const out = transformTicket({ ...raw, ClosedOn: '2026-01-21 11:00:00' })
    expect(out.closedAt).toBe('2026-01-21T11:00:00.000Z')
  })

  it('tagIds is always an empty array', () => {
    const out = transformTicket(raw)
    expect(out.tagIds).toEqual([])
  })

  it('sets platform to deskcom-desk365', () => {
    const out = transformTicket(raw)
    expect(out.platform).toBe('deskcom-desk365')
  })

  it('stores category and subcategory in metadata', () => {
    const out = transformTicket(raw)
    expect(out.metadata.category).toBe('Access')
    expect(out.metadata.subcategory).toBe('Login')
  })

  it('passes TicketSchema.parse', () => {
    const out = transformTicket(raw)
    expect(() => TicketSchema.parse(out)).not.toThrow()
  })

  it('falls back to epoch-0 when CreatedOn is missing', () => {
    const out = transformTicket({ TicketNumber: 2, Subject: 'No date' })
    expect(out.createdAt).toBe(new Date(0).toISOString())
  })
})
