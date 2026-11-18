import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/usedesk/transform/ticket'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/usedesk/transform/contact'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/usedesk/transform/team'

// ── Ticket transform ──────────────────────────────────────────────────────────

describe('UseDesk transformTicket', () => {
  it('maps status 1 (open) correctly', () => {
    const out = transformTicket({ id: 1, status: 1 } as any)
    expect(out.status).toBe('open')
    expect(out.platform).toBe('usedesk')
  })

  it('maps status 2 (executed) to resolved', () => {
    const out = transformTicket({ id: 2, status: 2 } as any)
    expect(out.status).toBe('resolved')
  })

  it('maps status 3 (closed) to closed', () => {
    const out = transformTicket({ id: 3, status: 3 } as any)
    expect(out.status).toBe('closed')
  })

  it('maps status 4 (deleted) to closed', () => {
    const out = transformTicket({ id: 4, status: 4 } as any)
    expect(out.status).toBe('closed')
  })

  it('maps status 5 (on_hold) to on_hold', () => {
    const out = transformTicket({ id: 5, status: 5 } as any)
    expect(out.status).toBe('on_hold')
  })

  it('maps status 6 (pending) to pending', () => {
    const out = transformTicket({ id: 6, status: 6 } as any)
    expect(out.status).toBe('pending')
  })

  it('maps status 7 (spam) to closed', () => {
    const out = transformTicket({ id: 7, status: 7 } as any)
    expect(out.status).toBe('closed')
  })

  it('maps status 8 (new) to open', () => {
    const out = transformTicket({ id: 8, status: 8 } as any)
    expect(out.status).toBe('open')
  })

  it('maps status 9 (mailing) to open', () => {
    const out = transformTicket({ id: 9, status: 9 } as any)
    expect(out.status).toBe('open')
  })

  it('maps priority correctly', () => {
    expect(transformTicket({ id: 10, priority: 'low' } as any).priority).toBe('low')
    expect(transformTicket({ id: 11, priority: 'medium' } as any).priority).toBe('normal')
    expect(transformTicket({ id: 12, priority: 'urgent' } as any).priority).toBe('urgent')
    expect(transformTicket({ id: 13, priority: 'extreme' } as any).priority).toBe('urgent')
    expect(transformTicket({ id: 14, priority: null } as any).priority).toBeUndefined()
  })

  it('normalises UseDesk datetime format to ISO-8601', () => {
    const out = transformTicket({
      id: 20,
      created_at: '2026-01-15 09:30',
      last_updated_at: '2026-01-16 12:00',
    } as any)
    expect(out.createdAt).toBe('2026-01-15T09:30:00.000Z')
    expect(out.updatedAt).toBe('2026-01-16T12:00:00.000Z')
  })

  it('includes embedded tags as tagIds', () => {
    const out = transformTicket({
      id: 30,
      tags: [{ name: 'billing' }, { name: 'urgent' }],
    } as any)
    expect(out.tagIds).toEqual(['billing', 'urgent'])
  })

  it('sets resolvedAt only for resolved/closed statuses', () => {
    const resolved = transformTicket({
      id: 40,
      status: 2,
      last_updated_at: '2026-01-01 10:00',
    } as any)
    expect(resolved.resolvedAt).toBeDefined()

    const open = transformTicket({ id: 41, status: 1, last_updated_at: '2026-01-01 10:00' } as any)
    expect(open.resolvedAt).toBeUndefined()
  })

  it('does not throw for missing fields', () => {
    expect(() => transformTicket({} as any)).not.toThrow()
  })
})

// ── Message transform ─────────────────────────────────────────────────────────
// The documented comment shape is tested in usedesk/transform/message.test.ts (article 51377).

// ── Contact transform ─────────────────────────────────────────────────────────

describe('UseDesk transformContact', () => {
  it('extracts first email from array of objects', () => {
    const out = transformContact({
      id: 1,
      name: 'Alice',
      emails: [{ address: 'alice@example.com' }],
    } as any)
    expect(out.email).toBe('alice@example.com')
    expect(out.platform).toBe('usedesk')
  })

  it('falls back to client_id when id is absent', () => {
    const out = transformContact({ client_id: 99 } as any)
    expect(out.id).toBe('99')
  })

  it('does not throw for empty input', () => {
    expect(() => transformContact({} as any)).not.toThrow()
  })
})

// ── User / Tag transforms: see usedesk/transform/user.test.ts and tag.test.ts.

// ── Team transform ────────────────────────────────────────────────────────────

describe('UseDesk transformTeam', () => {
  it('maps group fields', () => {
    const out = transformTeam({ id: 3, name: 'Support Team' })
    expect(out.id).toBe('3')
    expect(out.name).toBe('Support Team')
    expect(out.platform).toBe('usedesk')
  })

  it('does not throw for empty input', () => {
    expect(() => transformTeam({})).not.toThrow()
  })
})
