import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/halopsa/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/halopsa/transform/message'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/halopsa/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/halopsa/transform/user'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/halopsa/transform/team'

// ---------------------------------------------------------------------------
// transformTicket
// ---------------------------------------------------------------------------

describe('HaloPSA transformTicket', () => {
  it('maps id correctly', () => {
    const out = transformTicket({ id: 42, summary: 'Test ticket' })
    expect(out.id).toBe('42')
    expect(out.externalId).toBe('42')
  })

  it('maps status: open (id=1)', () => {
    const out = transformTicket({ id: 1, status_id: 1, isopen: true })
    expect(out.status).toBe('open')
  })

  it('maps status: pending (id=3)', () => {
    const out = transformTicket({ id: 2, status_id: 3, status: { id: 3, name: 'Pending Customer' } })
    expect(out.status).toBe('pending')
  })

  it('maps status: on_hold (id=4)', () => {
    const out = transformTicket({ id: 3, status_id: 4, status: { id: 4, name: 'On Hold' } })
    expect(out.status).toBe('on_hold')
  })

  it('maps status: resolved (id=5)', () => {
    const out = transformTicket({ id: 4, status_id: 5, status: { id: 5, name: 'Resolved' } })
    expect(out.status).toBe('resolved')
  })

  it('maps status: closed (id=6)', () => {
    const out = transformTicket({ id: 5, status_id: 6, status: { id: 6, name: 'Closed' } })
    expect(out.status).toBe('closed')
  })

  it('maps status: closed via isopen=false when no known status name matches', () => {
    const out = transformTicket({ id: 6, isopen: false })
    expect(out.status).toBe('closed')
  })

  it('maps status: closed via name containing "closed"', () => {
    const out = transformTicket({ id: 7, status: { id: 99, name: 'Force Closed' } })
    expect(out.status).toBe('closed')
  })

  it('maps priority: urgent', () => {
    const out = transformTicket({ id: 10, priority: { id: 1, name: 'Critical' } })
    expect(out.priority).toBe('urgent')
  })

  it('maps priority: high', () => {
    const out = transformTicket({ id: 11, priority: { id: 2, name: 'High' } })
    expect(out.priority).toBe('high')
  })

  it('maps priority: normal', () => {
    const out = transformTicket({ id: 12, priority: { id: 3, name: 'Medium' } })
    expect(out.priority).toBe('normal')
  })

  it('maps priority: low', () => {
    const out = transformTicket({ id: 13, priority: { id: 4, name: 'Low' } })
    expect(out.priority).toBe('low')
  })

  it('returns undefined priority when name is unknown', () => {
    const out = transformTicket({ id: 14, priority: { id: 99, name: 'Unrecognized' } })
    expect(out.priority).toBeUndefined()
  })

  it('maps ref to externalId and number', () => {
    const out = transformTicket({ id: 20, ref: 'INC12345' })
    expect(out.externalId).toBe('INC12345')
    expect(out.number).toBe('INC12345')
  })

  it('maps subject from summary', () => {
    const out = transformTicket({ id: 21, summary: 'Login broken' })
    expect(out.subject).toBe('Login broken')
  })

  it('maps assigneeId from agent_id', () => {
    const out = transformTicket({ id: 22, agent_id: 7 })
    expect(out.assigneeId).toBe('7')
  })

  it('maps requesterId from user_id when present', () => {
    const out = transformTicket({ id: 23, user_id: 99, client_id: 5 })
    expect(out.requesterId).toBe('99')
  })

  it('falls back requesterId to client_id when user_id is absent', () => {
    const out = transformTicket({ id: 24, client_id: 5 })
    expect(out.requesterId).toBe('5')
  })

  it('maps teamId from team_id', () => {
    const out = transformTicket({ id: 25, team_id: 3 })
    expect(out.teamId).toBe('3')
  })

  it('maps tag objects to string IDs', () => {
    const out = transformTicket({ id: 26, tags: [{ id: 10, text: 'billing' }, { id: 11, text: 'urgent' }] })
    expect(out.tagIds).toEqual(['10', '11'])
  })

  it('maps tag strings directly', () => {
    const out = transformTicket({ id: 27, tags: ['tag-a', 'tag-b'] })
    expect(out.tagIds).toEqual(['tag-a', 'tag-b'])
  })

  it('createdAt is an ISO-8601 string', () => {
    const out = transformTicket({ id: 28, dateoccurred: '2026-01-15T09:30:00Z' })
    expect(out.createdAt).toBe('2026-01-15T09:30:00.000Z')
  })

  it('resolvedAt is set when status is resolved', () => {
    const out = transformTicket({
      id: 29,
      status_id: 5,
      status: { id: 5, name: 'Resolved' },
      dateclosed: '2026-02-01T14:20:00Z',
    })
    expect(out.resolvedAt).toBe('2026-02-01T14:20:00.000Z')
  })

  it('closedAt is set when status is closed', () => {
    const out = transformTicket({
      id: 30,
      status_id: 6,
      status: { id: 6, name: 'Closed' },
      dateclosed: '2026-02-02T10:00:00Z',
    })
    expect(out.closedAt).toBe('2026-02-02T10:00:00.000Z')
  })

  it('platform is always halopsa', () => {
    const out = transformTicket({ id: 31 })
    expect(out.platform).toBe('halopsa')
  })

  it('channel defaults to other', () => {
    const out = transformTicket({ id: 32 })
    expect(out.channel).toBe('other')
  })

  it('tagIds is always an array', () => {
    const out = transformTicket({ id: 33 })
    expect(Array.isArray(out.tagIds)).toBe(true)
    expect(out.tagIds).toEqual([])
  })

  it('raw is preserved', () => {
    const raw = { id: 34, summary: 'raw check' }
    const out = transformTicket(raw)
    expect(out.raw).toBe(raw)
  })

  it('does not throw on minimal input (just id)', () => {
    expect(() => transformTicket({ id: 0 })).not.toThrow()
  })

  it('does not throw on completely empty-ish input', () => {
    // id is required by the interface but we cast to test guard paths
    expect(() => transformTicket({ id: 0, summary: null, tags: null, status: null, priority: null })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformMessage — authorType mapping
// ---------------------------------------------------------------------------

describe('HaloPSA transformMessage authorType', () => {
  it('maps who_agentid > 0 to authorType=user', () => {
    const out = transformMessage({ id: 100, who_agentid: 5 }, 'tkt-1')
    expect(out.authorType).toBe('user')
  })

  it('maps who_agentid = 1 to authorType=user', () => {
    const out = transformMessage({ id: 101, who_agentid: 1 }, 'tkt-1')
    expect(out.authorType).toBe('user')
  })

  it('maps who_agentid = 0 to authorType=contact', () => {
    const out = transformMessage({ id: 102, who_agentid: 0 }, 'tkt-1')
    expect(out.authorType).toBe('contact')
  })

  it('maps who_agentid = null to authorType=contact', () => {
    const out = transformMessage({ id: 103, who_agentid: null }, 'tkt-1')
    expect(out.authorType).toBe('contact')
  })

  it('maps absent who_agentid to authorType=contact', () => {
    const out = transformMessage({ id: 104 }, 'tkt-1')
    expect(out.authorType).toBe('contact')
  })

  it('uses who_agentid as authorId when agent', () => {
    const out = transformMessage({ id: 105, who_agentid: 7, who: { id: 7, name: 'Agent Bob' } }, 'tkt-2')
    expect(out.authorId).toBe('7')
  })

  it('falls back to who.id as authorId for contact', () => {
    const out = transformMessage({ id: 106, who_agentid: 0, who: { id: 999, name: 'End User Alice' } }, 'tkt-2')
    expect(out.authorId).toBe('999')
  })

  it('maps isprivate=true to type=internal', () => {
    const out = transformMessage({ id: 107, isprivate: true }, 'tkt-3')
    expect(out.type).toBe('internal')
  })

  it('maps isprivate=false to type=public', () => {
    const out = transformMessage({ id: 108, isprivate: false }, 'tkt-3')
    expect(out.type).toBe('public')
  })

  it('prefers outcome over note for body', () => {
    const out = transformMessage({ id: 109, outcome: 'outcome text', note: 'note text' }, 'tkt-4')
    expect(out.body).toBe('outcome text')
  })

  it('falls back to note when outcome is absent', () => {
    const out = transformMessage({ id: 110, note: 'only note' }, 'tkt-4')
    expect(out.body).toBe('only note')
  })

  it('platform is always halopsa', () => {
    const out = transformMessage({ id: 111 }, 'tkt-5')
    expect(out.platform).toBe('halopsa')
  })

  it('ticketId is passed through', () => {
    const out = transformMessage({ id: 112 }, 'ticket-99')
    expect(out.ticketId).toBe('ticket-99')
  })

  it('createdAt is an ISO-8601 string', () => {
    const out = transformMessage({ id: 113, date: '2026-03-01T12:00:00Z' }, 'tkt-6')
    expect(out.createdAt).toBe('2026-03-01T12:00:00.000Z')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformMessage({ id: 0 }, 'tkt-min')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformContact
// ---------------------------------------------------------------------------

describe('HaloPSA transformContact', () => {
  it('maps id, email, name', () => {
    const out = transformContact({ id: 200, name: 'Jane Doe', emailaddress: 'jane@example.com' })
    expect(out.id).toBe('200')
    expect(out.email).toBe('jane@example.com')
    expect(out.name).toBe('Jane Doe')
    expect(out.platform).toBe('halopsa')
  })

  it('builds name from firstname + surname when name is absent', () => {
    const out = transformContact({ id: 201, firstname: 'John', surname: 'Smith' })
    expect(out.name).toBe('John Smith')
  })

  it('maps organizationId from client_id', () => {
    const out = transformContact({ id: 202, client_id: 10 })
    expect(out.organizationId).toBe('10')
  })

  it('falls back organizationId to site_id when client_id absent', () => {
    const out = transformContact({ id: 203, site_id: 5 })
    expect(out.organizationId).toBe('5')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformContact({ id: 0 })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformUser
// ---------------------------------------------------------------------------

describe('HaloPSA transformUser', () => {
  it('maps id, email, name', () => {
    const out = transformUser({ id: 300, name: 'Alice Agent', email: 'alice@example.com' })
    expect(out.id).toBe('300')
    expect(out.email).toBe('alice@example.com')
    expect(out.name).toBe('Alice Agent')
    expect(out.platform).toBe('halopsa')
  })

  it('builds name from firstname + surname when name absent', () => {
    const out = transformUser({ id: 301, firstname: 'Bob', surname: 'Techie' })
    expect(out.name).toBe('Bob Techie')
  })

  it('maps teamIds from team_id', () => {
    const out = transformUser({ id: 302, team_id: 4 })
    expect(out.teamIds).toEqual(['4'])
  })

  it('returns empty teamIds when team_id is absent', () => {
    const out = transformUser({ id: 303 })
    expect(out.teamIds).toEqual([])
  })

  it('maps role from role object name', () => {
    const out = transformUser({ id: 304, role: { id: 1, name: 'Technician' } })
    expect(out.role).toBe('Technician')
  })

  it('maps role from string value', () => {
    const out = transformUser({ id: 305, role: 'Admin' })
    expect(out.role).toBe('Admin')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformUser({ id: 0 })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformTeam
// ---------------------------------------------------------------------------

describe('HaloPSA transformTeam', () => {
  it('maps id and name', () => {
    const out = transformTeam({ id: 400, name: 'Support Team' })
    expect(out.id).toBe('400')
    expect(out.name).toBe('Support Team')
    expect(out.platform).toBe('halopsa')
  })

  it('maps department metadata', () => {
    const out = transformTeam({ id: 401, name: 'L2 Team', department_id: 2, department_name: 'Engineering' })
    expect(out.metadata['department_id']).toBe('2')
    expect(out.metadata['department_name']).toBe('Engineering')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformTeam({ id: 0 })).not.toThrow()
  })
})
