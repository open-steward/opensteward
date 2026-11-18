import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/richpanel/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/richpanel/transform/message'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/richpanel/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/richpanel/transform/user'

// ---------------------------------------------------------------------------
// transformTicket — status mapping (uppercase Richpanel values)
// ---------------------------------------------------------------------------

describe('Richpanel transformTicket', () => {
  it('maps uppercase OPEN status to open', () => {
    const out = transformTicket({ id: '1', status: 'OPEN', subject: 'Help' })
    expect(out.id).toBe('1')
    expect(out.platform).toBe('richpanel')
    expect(out.status).toBe('open')
  })

  it('maps uppercase CLOSED status to closed', () => {
    const out = transformTicket({ id: '2', status: 'CLOSED', subject: 'Done' })
    expect(out.status).toBe('closed')
  })

  it('maps lowercase open status to open (backward compat)', () => {
    const out = transformTicket({ id: '3', status: 'open', subject: 'X' })
    expect(out.status).toBe('open')
  })

  it('maps lowercase closed to closed', () => {
    const out = transformTicket({ id: '4', status: 'closed', subject: 'X' })
    expect(out.status).toBe('closed')
  })

  it('maps PENDING to pending', () => {
    const out = transformTicket({ id: '5', status: 'PENDING', subject: 'X' })
    expect(out.status).toBe('pending')
  })

  it('maps SOLVED to resolved', () => {
    const out = transformTicket({ id: '6', status: 'SOLVED', subject: 'X' })
    expect(out.status).toBe('resolved')
  })

  it('defaults unknown status to open', () => {
    const out = transformTicket({ id: '7', status: 'WEIRD', subject: 'X' })
    expect(out.status).toBe('open')
  })

  it('exposes embedded comments on raw object', () => {
    const comment = { id: 'c1', body: 'hi', created_at: '2026-01-01T00:00:00Z' }
    const out = transformTicket({ id: '8', status: 'OPEN', subject: 'Y', comments: [comment] })
    expect((out.raw as { comments?: unknown[] }).comments).toHaveLength(1)
  })

  it('produces ISO-8601 createdAt', () => {
    const out = transformTicket({ id: '9', status: 'OPEN', subject: 'Z', created_at: '2026-06-01T12:00:00.000Z' })
    expect(out.createdAt).toBe('2026-06-01T12:00:00.000Z')
  })

  it('guards undefined status (never throws)', () => {
    const out = transformTicket({ id: '10' })
    expect(out.status).toBe('open')
  })
})

// ---------------------------------------------------------------------------
// transformMessage — reads comment fields correctly
// ---------------------------------------------------------------------------

describe('Richpanel transformMessage', () => {
  it('maps public comment to public message type', () => {
    const raw = { id: 'c1', body: 'Hello', public: true, created_at: '2026-06-01T00:00:00Z' }
    const out = transformMessage(raw, 'ticket-1')
    expect(out.id).toBe('c1')
    expect(out.ticketId).toBe('ticket-1')
    expect(out.type).toBe('public')
    expect(out.platform).toBe('richpanel')
    expect(out.body).toBe('Hello')
  })

  it('maps private note (public=false) to internal type', () => {
    const raw = { id: 'c2', body: 'Note', public: false, created_at: '2026-06-01T00:00:00Z' }
    const out = transformMessage(raw, 'ticket-2')
    expect(out.type).toBe('internal')
  })

  it('uses isOperator flag to set authorType=agent', () => {
    const raw = { id: 'c3', body: 'Agent reply', isOperator: true, created_at: '2026-06-01T00:00:00Z' }
    const out = transformMessage(raw, 'ticket-3')
    expect(out.authorType).toBe('agent')
  })

  it('sets authorType=user when isOperator is false', () => {
    const raw = { id: 'c4', body: 'Customer msg', isOperator: false, created_at: '2026-06-01T00:00:00Z' }
    const out = transformMessage(raw, 'ticket-4')
    expect(out.authorType).toBe('user')
  })

  it('prefers plain_body over body', () => {
    const raw = { id: 'c5', body: '<b>HTML</b>', plain_body: 'plain text', created_at: '2026-06-01T00:00:00Z' }
    const out = transformMessage(raw, 'ticket-5')
    expect(out.body).toBe('plain text')
  })
})

// ---------------------------------------------------------------------------
// transformContact — basic field mapping
// ---------------------------------------------------------------------------

describe('Richpanel transformContact', () => {
  it('maps customer fields', () => {
    const raw = { id: 42, uid: 'uid-abc', name: 'Jane Doe', email: 'jane@example.com', phone: '+1555000000' }
    const out = transformContact(raw)
    expect(out.id).toBe('42')
    expect(out.externalId).toBe('uid-abc')
    expect(out.email).toBe('jane@example.com')
    expect(out.name).toBe('Jane Doe')
    expect(out.phone).toBe('+1555000000')
    expect(out.platform).toBe('richpanel')
  })

  it('falls back to id when uid absent', () => {
    const raw = { id: '99' }
    const out = transformContact(raw)
    expect(out.externalId).toBe('99')
  })
})

// ---------------------------------------------------------------------------
// transformUser — basic field mapping
// ---------------------------------------------------------------------------

describe('Richpanel transformUser', () => {
  it('maps user/agent fields', () => {
    const raw = { id: 7, name: 'Agent Smith', email: 'agent@example.com', role: 'admin', team_id: '3' }
    const out = transformUser(raw)
    expect(out.id).toBe('7')
    expect(out.name).toBe('Agent Smith')
    expect(out.email).toBe('agent@example.com')
    expect(out.role).toBe('admin')
    expect(out.teamIds).toEqual(['3'])
    expect(out.platform).toBe('richpanel')
  })

  it('returns empty teamIds when team_id absent', () => {
    const raw = { id: '8', name: 'Solo Agent' }
    const out = transformUser(raw)
    expect(out.teamIds).toEqual([])
  })
})
