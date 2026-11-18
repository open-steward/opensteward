import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/freshservice/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/freshservice/transform/message'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/freshservice/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/freshservice/transform/user'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/freshservice/transform/team'

// ---------------------------------------------------------------------------
// transformTicket
// ---------------------------------------------------------------------------

describe('Freshservice transformTicket', () => {
  it('maps id correctly', () => {
    const out = transformTicket({ id: 42 })
    expect(out.id).toBe('42')
    expect(out.externalId).toBe('42')
    expect(out.number).toBe('42')
  })

  it('maps status: open (2)', () => {
    const out = transformTicket({ id: 1, status: 2 })
    expect(out.status).toBe('open')
  })

  it('maps status: pending (3)', () => {
    const out = transformTicket({ id: 2, status: 3 })
    expect(out.status).toBe('pending')
  })

  it('maps status: resolved (4)', () => {
    const out = transformTicket({ id: 3, status: 4 })
    expect(out.status).toBe('resolved')
  })

  it('maps status: closed (5)', () => {
    const out = transformTicket({ id: 4, status: 5 })
    expect(out.status).toBe('closed')
  })

  it('defaults status to open when unknown', () => {
    const out = transformTicket({ id: 5, status: 99 })
    expect(out.status).toBe('open')
  })

  it('maps priority: low (1)', () => {
    const out = transformTicket({ id: 10, priority: 1 })
    expect(out.priority).toBe('low')
  })

  it('maps priority: normal (2)', () => {
    const out = transformTicket({ id: 11, priority: 2 })
    expect(out.priority).toBe('normal')
  })

  it('maps priority: high (3)', () => {
    const out = transformTicket({ id: 12, priority: 3 })
    expect(out.priority).toBe('high')
  })

  it('maps priority: urgent (4)', () => {
    const out = transformTicket({ id: 13, priority: 4 })
    expect(out.priority).toBe('urgent')
  })

  it('returns undefined priority when unknown', () => {
    const out = transformTicket({ id: 14, priority: 99 })
    expect(out.priority).toBeUndefined()
  })

  it('maps channel: email (source=1)', () => {
    const out = transformTicket({ id: 20, source: 1 })
    expect(out.channel).toBe('email')
  })

  it('maps channel: web (source=2)', () => {
    const out = transformTicket({ id: 21, source: 2 })
    expect(out.channel).toBe('web')
  })

  it('maps channel: voice (source=3)', () => {
    const out = transformTicket({ id: 22, source: 3 })
    expect(out.channel).toBe('voice')
  })

  it('maps channel: chat (source=4)', () => {
    const out = transformTicket({ id: 23, source: 4 })
    expect(out.channel).toBe('chat')
  })

  it('maps channel: api (source=8)', () => {
    const out = transformTicket({ id: 24, source: 8 })
    expect(out.channel).toBe('api')
  })

  it('maps channel: social (source=10 Twitter/X)', () => {
    const out = transformTicket({ id: 25, source: 10 })
    expect(out.channel).toBe('social')
  })

  it('maps channel: social (source=11 Facebook)', () => {
    const out = transformTicket({ id: 26, source: 11 })
    expect(out.channel).toBe('social')
  })

  it('maps channel: social (source=12 WhatsApp)', () => {
    const out = transformTicket({ id: 27, source: 12 })
    expect(out.channel).toBe('social')
  })

  it('defaults channel to other when unknown source', () => {
    const out = transformTicket({ id: 28, source: 99 })
    expect(out.channel).toBe('other')
  })

  it('maps subject', () => {
    const out = transformTicket({ id: 30, subject: 'Login is broken' })
    expect(out.subject).toBe('Login is broken')
  })

  it('maps assigneeId from responder_id', () => {
    const out = transformTicket({ id: 31, responder_id: 55 })
    expect(out.assigneeId).toBe('55')
  })

  it('maps teamId from group_id', () => {
    const out = transformTicket({ id: 32, group_id: 7 })
    expect(out.teamId).toBe('7')
  })

  it('maps tagIds from tags array', () => {
    const out = transformTicket({ id: 33, tags: ['billing', 'urgent'] })
    expect(out.tagIds).toEqual(['billing', 'urgent'])
  })

  it('tagIds defaults to empty array when absent', () => {
    const out = transformTicket({ id: 34 })
    expect(Array.isArray(out.tagIds)).toBe(true)
    expect(out.tagIds).toEqual([])
  })

  it('createdAt is an ISO-8601 string', () => {
    const out = transformTicket({ id: 35, created_at: '2026-01-15T09:30:00Z' })
    expect(out.createdAt).toBe('2026-01-15T09:30:00.000Z')
  })

  it('resolvedAt uses resolved_at field when present', () => {
    const out = transformTicket({
      id: 36,
      status: 4,
      resolved_at: '2026-02-10T12:00:00Z',
      updated_at: '2026-02-11T08:00:00Z',
    })
    expect(out.resolvedAt).toBe('2026-02-10T12:00:00.000Z')
  })

  it('resolvedAt is undefined when resolved_at is absent even if status is resolved', () => {
    const out = transformTicket({ id: 37, status: 4 })
    expect(out.resolvedAt).toBeUndefined()
  })

  it('resolvedAt does NOT use updated_at as a proxy', () => {
    const out = transformTicket({ id: 38, status: 4, updated_at: '2026-02-11T08:00:00Z' })
    // Without resolved_at field, resolvedAt must be undefined
    expect(out.resolvedAt).toBeUndefined()
  })

  it('platform is always freshservice', () => {
    const out = transformTicket({ id: 40 })
    expect(out.platform).toBe('freshservice')
  })

  it('raw is preserved', () => {
    const raw = { id: 41, subject: 'raw check' }
    const out = transformTicket(raw)
    expect(out.raw).toBe(raw)
  })

  it('does not throw on minimal input (just id)', () => {
    expect(() => transformTicket({ id: 0 })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformMessage
// ---------------------------------------------------------------------------

describe('Freshservice transformMessage', () => {
  it('maps id and ticketId', () => {
    const out = transformMessage({ id: 100 }, 'tkt-1')
    expect(out.id).toBe('100')
    expect(out.ticketId).toBe('tkt-1')
  })

  it('maps type: internal when private=true', () => {
    const out = transformMessage({ id: 101, private: true }, 'tkt-1')
    expect(out.type).toBe('internal')
  })

  it('maps type: public when private=false', () => {
    const out = transformMessage({ id: 102, private: false }, 'tkt-1')
    expect(out.type).toBe('public')
  })

  it('maps authorType: contact when incoming=true', () => {
    const out = transformMessage({ id: 103, incoming: true }, 'tkt-1')
    expect(out.authorType).toBe('contact')
  })

  it('maps authorType: user when incoming=false', () => {
    const out = transformMessage({ id: 104, incoming: false }, 'tkt-1')
    expect(out.authorType).toBe('user')
  })

  it('maps authorId from user_id', () => {
    const out = transformMessage({ id: 105, user_id: 42 }, 'tkt-1')
    expect(out.authorId).toBe('42')
  })

  it('prefers body_text over body (HTML)', () => {
    const out = transformMessage({ id: 106, body_text: 'plain text', body: '<p>html</p>' }, 'tkt-1')
    expect(out.body).toBe('plain text')
  })

  it('falls back to body (HTML) when body_text is absent', () => {
    const out = transformMessage({ id: 107, body: '<p>html only</p>' }, 'tkt-1')
    expect(out.body).toBe('<p>html only</p>')
  })

  it('maps attachmentCount', () => {
    const out = transformMessage({ id: 108, attachments: [{ id: 1 }, { id: 2 }] }, 'tkt-1')
    expect(out.attachmentCount).toBe(2)
  })

  it('createdAt is an ISO-8601 string', () => {
    const out = transformMessage({ id: 109, created_at: '2026-03-01T12:00:00Z' }, 'tkt-1')
    expect(out.createdAt).toBe('2026-03-01T12:00:00.000Z')
  })

  it('platform is always freshservice', () => {
    const out = transformMessage({ id: 110 }, 'tkt-1')
    expect(out.platform).toBe('freshservice')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformMessage({ id: 0 }, 'tkt-min')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformContact
// ---------------------------------------------------------------------------

describe('Freshservice transformContact', () => {
  it('maps id, email, name', () => {
    const out = transformContact({ id: 200, first_name: 'Jane', last_name: 'Doe', primary_email: 'jane@example.com' })
    expect(out.id).toBe('200')
    expect(out.email).toBe('jane@example.com')
    expect(out.name).toBe('Jane Doe')
    expect(out.platform).toBe('freshservice')
  })

  it('builds name from first_name only when last_name is absent', () => {
    const out = transformContact({ id: 201, first_name: 'Jane' })
    expect(out.name).toBe('Jane')
  })

  it('maps organizationId from department_id', () => {
    const out = transformContact({ id: 202, department_id: 10 })
    expect(out.organizationId).toBe('10')
  })

  it('maps externalId from external_id when present', () => {
    const out = transformContact({ id: 203, external_id: 'ext-abc' })
    expect(out.externalId).toBe('ext-abc')
  })

  it('falls back externalId to id when external_id is absent', () => {
    const out = transformContact({ id: 204 })
    expect(out.externalId).toBe('204')
  })

  it('maps phone from phone field', () => {
    const out = transformContact({ id: 205, phone: '+1-555-0100' })
    expect(out.phone).toBe('+1-555-0100')
  })

  it('falls back phone to mobile_phone when phone is absent', () => {
    const out = transformContact({ id: 206, mobile_phone: '+1-555-0200' })
    expect(out.phone).toBe('+1-555-0200')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformContact({ id: 0 })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformUser
// ---------------------------------------------------------------------------

describe('Freshservice transformUser', () => {
  it('maps id, email, name', () => {
    const out = transformUser({ id: 300, first_name: 'Alice', last_name: 'Agent', email: 'alice@example.com' })
    expect(out.id).toBe('300')
    expect(out.email).toBe('alice@example.com')
    expect(out.name).toBe('Alice Agent')
    expect(out.platform).toBe('freshservice')
  })

  it('builds name from first_name only when last_name is absent', () => {
    const out = transformUser({ id: 301, first_name: 'Bob' })
    expect(out.name).toBe('Bob')
  })

  it('maps teamIds from group_memberships', () => {
    const out = transformUser({ id: 302, group_memberships: [{ group_id: 7 }, { group_id: 8 }] })
    expect(out.teamIds).toEqual(['7', '8'])
  })

  it('returns empty teamIds when group_memberships is absent', () => {
    const out = transformUser({ id: 303 })
    expect(out.teamIds).toEqual([])
  })

  it('maps role from first roles[0].assignment_scope', () => {
    const out = transformUser({ id: 304, roles: [{ assignment_scope: 'global_access' }] })
    expect(out.role).toBe('global_access')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformUser({ id: 0 })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformTeam
// ---------------------------------------------------------------------------

describe('Freshservice transformTeam', () => {
  it('maps id and name', () => {
    const out = transformTeam({ id: 400, name: 'Support Team' })
    expect(out.id).toBe('400')
    expect(out.name).toBe('Support Team')
    expect(out.platform).toBe('freshservice')
  })

  it('maps description into metadata', () => {
    const out = transformTeam({ id: 401, name: 'L2 Team', description: 'Level 2 support' })
    expect(out.metadata['description']).toBe('Level 2 support')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformTeam({ id: 0 })).not.toThrow()
  })
})
