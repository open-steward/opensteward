import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawJitbitTicket,
} from '../../../../../../../src/verticals/customer-support/adapters/jitbit-helpdesk/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

describe('jitbit-helpdesk transformTicket', () => {
  it('maps Status "New" to open', () => {
    const raw: RawJitbitTicket = {
      IssueID: 1,
      Status: 'New',
      IssueDate: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.status).toBe('open')
  })

  it('maps Status "In process" to pending', () => {
    const raw: RawJitbitTicket = {
      IssueID: 2,
      Status: 'In process',
      IssueDate: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.status).toBe('pending')
  })

  it('maps Status "Closed" to closed', () => {
    const raw: RawJitbitTicket = {
      IssueID: 3,
      Status: 'Closed',
      IssueDate: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.status).toBe('closed')
  })

  it('falls back to StatusID when Status label is absent', () => {
    const raw: RawJitbitTicket = { IssueID: 4, StatusID: 2, IssueDate: '2026-01-15T09:30:00.000Z' }
    const result = transformTicket(raw)
    expect(result.status).toBe('pending')
  })

  it('maps Priority -1 to low', () => {
    const raw: RawJitbitTicket = { IssueID: 5, Priority: -1, IssueDate: '2026-01-15T09:30:00.000Z' }
    const result = transformTicket(raw)
    expect(result.priority).toBe('low')
  })

  it('maps Priority 0 to normal', () => {
    const raw: RawJitbitTicket = { IssueID: 6, Priority: 0, IssueDate: '2026-01-15T09:30:00.000Z' }
    const result = transformTicket(raw)
    expect(result.priority).toBe('normal')
  })

  it('maps Priority 1 to high', () => {
    const raw: RawJitbitTicket = { IssueID: 7, Priority: 1, IssueDate: '2026-01-15T09:30:00.000Z' }
    const result = transformTicket(raw)
    expect(result.priority).toBe('high')
  })

  it('maps Priority 2 to urgent', () => {
    const raw: RawJitbitTicket = { IssueID: 8, Priority: 2, IssueDate: '2026-01-15T09:30:00.000Z' }
    const result = transformTicket(raw)
    expect(result.priority).toBe('urgent')
  })

  it('maps Origin 1 to email channel', () => {
    const raw: RawJitbitTicket = { IssueID: 9, Origin: 1, IssueDate: '2026-01-15T09:30:00.000Z' }
    const result = transformTicket(raw)
    expect(result.channel).toBe('email')
  })

  it('maps Origin 4 to chat channel', () => {
    const raw: RawJitbitTicket = { IssueID: 10, Origin: 4, IssueDate: '2026-01-15T09:30:00.000Z' }
    const result = transformTicket(raw)
    expect(result.channel).toBe('chat')
  })

  it('maps Origin 3 to api channel', () => {
    const raw: RawJitbitTicket = { IssueID: 11, Origin: 3, IssueDate: '2026-01-15T09:30:00.000Z' }
    const result = transformTicket(raw)
    expect(result.channel).toBe('api')
  })

  it('parses Tags array of objects', () => {
    const raw: RawJitbitTicket = {
      IssueID: 12,
      Tags: [
        { TagID: 1, Name: 'billing' },
        { TagID: 2, Name: 'urgent' },
      ],
      IssueDate: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.tagIds).toEqual(['billing', 'urgent'])
  })

  it('parses Tags as comma-separated string', () => {
    const raw: RawJitbitTicket = {
      IssueID: 13,
      Tags: 'billing, urgent, login',
      IssueDate: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.tagIds).toEqual(['billing', 'urgent', 'login'])
  })

  it('maps UserID to requesterId', () => {
    const raw: RawJitbitTicket = { IssueID: 14, UserID: 88, IssueDate: '2026-01-15T09:30:00.000Z' }
    const result = transformTicket(raw)
    expect(result.requesterId).toBe('88')
  })

  it('maps Subject to subject', () => {
    const raw: RawJitbitTicket = {
      IssueID: 15,
      Subject: 'Cannot login',
      IssueDate: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.subject).toBe('Cannot login')
  })

  it('sets platform to jitbit-helpdesk', () => {
    const raw: RawJitbitTicket = { IssueID: 16, IssueDate: '2026-01-15T09:30:00.000Z' }
    const result = transformTicket(raw)
    expect(result.platform).toBe('jitbit-helpdesk')
  })

  it('passes TicketSchema validation', () => {
    const raw: RawJitbitTicket = {
      IssueID: 99,
      Subject: 'Valid ticket',
      Status: 'New',
      Priority: 0,
      Origin: 1,
      UserID: 5,
      AssignedToUserID: 10,
      IssueDate: '2026-01-15T09:30:00.000Z',
      LastUpdated: '2026-02-01T14:20:00.000Z',
      Tags: [{ TagID: 1, Name: 'test' }],
    }
    const result = transformTicket(raw)
    expect(() => TicketSchema.parse(result)).not.toThrow()
  })
})
