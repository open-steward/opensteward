import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/deskpro/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/deskpro/transform/message'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/deskpro/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/deskpro/transform/user'
import { transformTag } from '../../../../../src/verticals/customer-support/adapters/deskpro/transform/tag'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/deskpro/transform/team'
import { transformMacro } from '../../../../../src/verticals/customer-support/adapters/deskpro/transform/macro'

// ---------------------------------------------------------------------------
// transformTicket
// ---------------------------------------------------------------------------

describe('Deskpro transformTicket', () => {
  it('maps id and ref to externalId', () => {
    const out = transformTicket({ id: 42, ref: 'XXXX-0028-IOCC', subject: 'Test' })
    expect(out.id).toBe('42')
    expect(out.externalId).toBe('XXXX-0028-IOCC')
    expect(out.number).toBe('42')
  })

  it('falls back externalId to string id when ref is absent', () => {
    const out = transformTicket({ id: 5 })
    expect(out.externalId).toBe('5')
  })

  it('maps status: awaiting_agent → open', () => {
    const out = transformTicket({ id: 1, status: 'awaiting_agent' })
    expect(out.status).toBe('open')
  })

  it('maps status: live → open', () => {
    const out = transformTicket({ id: 2, status: 'live' })
    expect(out.status).toBe('open')
  })

  it('maps status: awaiting_user → pending', () => {
    const out = transformTicket({ id: 3, status: 'awaiting_user' })
    expect(out.status).toBe('pending')
  })

  it('maps status: resolved → resolved', () => {
    const out = transformTicket({ id: 4, status: 'resolved' })
    expect(out.status).toBe('resolved')
  })

  it('maps status: archived → closed', () => {
    const out = transformTicket({ id: 5, status: 'archived' })
    expect(out.status).toBe('closed')
  })

  it('maps status: hidden → closed', () => {
    const out = transformTicket({ id: 6, status: 'hidden' })
    expect(out.status).toBe('closed')
  })

  it('maps priority from object with name=high', () => {
    const out = transformTicket({ id: 10, priority: { id: 3, name: 'high' } })
    expect(out.priority).toBe('high')
  })

  it('maps priority from object with name=urgent', () => {
    const out = transformTicket({ id: 11, priority: { id: 4, name: 'urgent' } })
    expect(out.priority).toBe('urgent')
  })

  it('maps priority from object with name=normal', () => {
    const out = transformTicket({ id: 12, priority: { id: 2, name: 'normal' } })
    expect(out.priority).toBe('normal')
  })

  it('maps priority from object with name=low', () => {
    const out = transformTicket({ id: 13, priority: { id: 1, name: 'low' } })
    expect(out.priority).toBe('low')
  })

  it('returns undefined priority for unknown name', () => {
    const out = transformTicket({ id: 14, priority: { id: 99, name: 'extreme' } })
    expect(out.priority).toBeUndefined()
  })

  it('maps channel: email from creation_system', () => {
    const out = transformTicket({ id: 20, creation_system: 'email' })
    expect(out.channel).toBe('email')
  })

  it('maps channel: chat from "chat.widget"', () => {
    const out = transformTicket({ id: 21, creation_system: 'chat.widget' })
    expect(out.channel).toBe('chat')
  })

  it('maps channel: api from creation_system', () => {
    const out = transformTicket({ id: 22, creation_system: 'api' })
    expect(out.channel).toBe('api')
  })

  it('maps channel: other for unknown creation_system', () => {
    const out = transformTicket({ id: 23, creation_system: 'unknown_channel' })
    expect(out.channel).toBe('other')
  })

  it('maps requesterId from person object', () => {
    const out = transformTicket({ id: 30, person: { id: 7 } })
    expect(out.requesterId).toBe('7')
  })

  it('maps requesterId from person id number', () => {
    const out = transformTicket({ id: 31, person: 99 })
    expect(out.requesterId).toBe('99')
  })

  it('maps assigneeId from agent object', () => {
    const out = transformTicket({ id: 32, agent: { id: 5 } })
    expect(out.assigneeId).toBe('5')
  })

  it('maps teamId from department object', () => {
    const out = transformTicket({ id: 33, department: { id: 3, title: 'Support' } })
    expect(out.teamId).toBe('3')
  })

  it('maps tagIds from string labels', () => {
    const out = transformTicket({ id: 40, labels: ['billing', 'urgent'] })
    expect(out.tagIds).toEqual(['billing', 'urgent'])
  })

  it('maps tagIds from label objects', () => {
    const out = transformTicket({ id: 41, labels: [{ id: 10, label: 'vip' }, { id: 11, label: 'enterprise' }] })
    expect(out.tagIds).toEqual(['vip', 'enterprise'])
  })

  it('createdAt is ISO-8601', () => {
    const out = transformTicket({ id: 50, date_created: '2026-01-15T09:30:00Z' })
    expect(out.createdAt).toBe('2026-01-15T09:30:00.000Z')
  })

  it('resolvedAt is set from date_resolved', () => {
    const out = transformTicket({ id: 51, status: 'resolved', date_resolved: '2026-02-01T14:00:00Z' })
    expect(out.resolvedAt).toBe('2026-02-01T14:00:00.000Z')
  })

  it('closedAt is set from date_archived', () => {
    const out = transformTicket({ id: 52, status: 'archived', date_archived: '2026-03-01T10:00:00Z' })
    expect(out.closedAt).toBe('2026-03-01T10:00:00.000Z')
  })

  it('platform is always deskpro', () => {
    const out = transformTicket({ id: 60 })
    expect(out.platform).toBe('deskpro')
  })

  it('raw is preserved', () => {
    const raw = { id: 61, subject: 'raw check' }
    const out = transformTicket(raw)
    expect(out.raw).toBe(raw)
  })

  it('does not throw on minimal input', () => {
    expect(() => transformTicket({ id: 0 })).not.toThrow()
  })

  it('tagIds is always an array', () => {
    const out = transformTicket({ id: 70 })
    expect(Array.isArray(out.tagIds)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// transformMessage
// ---------------------------------------------------------------------------

describe('Deskpro transformMessage', () => {
  it('maps id and ticketId', () => {
    const out = transformMessage({ id: 100 }, 'tkt-42')
    expect(out.id).toBe('100')
    expect(out.ticketId).toBe('tkt-42')
  })

  it('maps is_note=true to type=internal', () => {
    const out = transformMessage({ id: 101, is_note: true }, 'tkt-1')
    expect(out.type).toBe('internal')
  })

  it('maps is_note=false to type=public', () => {
    const out = transformMessage({ id: 102, is_note: false }, 'tkt-1')
    expect(out.type).toBe('public')
  })

  it('maps person.is_agent=true to authorType=agent', () => {
    const out = transformMessage({ id: 103, person: { id: 7, is_agent: true } }, 'tkt-1')
    expect(out.authorType).toBe('agent')
    expect(out.authorId).toBe('7')
  })

  it('maps person.is_agent=false to authorType=user', () => {
    const out = transformMessage({ id: 104, person: { id: 8, is_agent: false } }, 'tkt-1')
    expect(out.authorType).toBe('user')
  })

  it('maps person as number to authorType=user', () => {
    const out = transformMessage({ id: 105, person: 55 }, 'tkt-1')
    expect(out.authorType).toBe('user')
    expect(out.authorId).toBe('55')
  })

  it('uses message as body', () => {
    const out = transformMessage({ id: 110, message: 'Hello world' }, 'tkt-1')
    expect(out.body).toBe('Hello world')
  })

  it('falls back to message_html when message is absent', () => {
    const out = transformMessage({ id: 111, message_html: '<p>HTML</p>' }, 'tkt-1')
    expect(out.body).toBe('<p>HTML</p>')
  })

  it('maps attachmentCount from attachments array length', () => {
    const out = transformMessage({ id: 112, attachments: [{ id: 1 }, { id: 2 }] }, 'tkt-1')
    expect(out.attachmentCount).toBe(2)
  })

  it('createdAt is ISO-8601', () => {
    const out = transformMessage({ id: 113, date_created: '2026-03-01T12:00:00Z' }, 'tkt-1')
    expect(out.createdAt).toBe('2026-03-01T12:00:00.000Z')
  })

  it('platform is always deskpro', () => {
    const out = transformMessage({ id: 114 }, 'tkt-1')
    expect(out.platform).toBe('deskpro')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformMessage({ id: 0 }, 'tkt-min')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformContact
// ---------------------------------------------------------------------------

describe('Deskpro transformContact', () => {
  it('maps id, name', () => {
    const out = transformContact({ id: 200, name: 'Jane Doe' })
    expect(out.id).toBe('200')
    expect(out.name).toBe('Jane Doe')
    expect(out.platform).toBe('deskpro')
  })

  it('maps email from primary_email object', () => {
    const out = transformContact({ id: 201, primary_email: { email: 'jane@example.com' } })
    expect(out.email).toBe('jane@example.com')
  })

  it('maps email from primary_email string', () => {
    const out = transformContact({ id: 202, primary_email: 'direct@example.com' })
    expect(out.email).toBe('direct@example.com')
  })

  it('maps phone from phone_numbers array', () => {
    const out = transformContact({ id: 203, phone_numbers: [{ phone: '+1-555-0100' }] })
    expect(out.phone).toBe('+1-555-0100')
  })

  it('maps organizationId from organization object', () => {
    const out = transformContact({ id: 204, organization: { id: 10 } })
    expect(out.organizationId).toBe('10')
  })

  it('maps organizationId from organization number', () => {
    const out = transformContact({ id: 205, organization: 99 })
    expect(out.organizationId).toBe('99')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformContact({ id: 0 })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformUser
// ---------------------------------------------------------------------------

describe('Deskpro transformUser', () => {
  it('maps id and name', () => {
    const out = transformUser({ id: 300, name: 'Alice Agent' })
    expect(out.id).toBe('300')
    expect(out.name).toBe('Alice Agent')
    expect(out.platform).toBe('deskpro')
    expect(out.role).toBe('agent')
  })

  it('maps email from primary_email object', () => {
    const out = transformUser({ id: 301, primary_email: { email: 'alice@example.com' } })
    expect(out.email).toBe('alice@example.com')
  })

  it('maps email from primary_email string', () => {
    const out = transformUser({ id: 302, primary_email: 'direct@example.com' })
    expect(out.email).toBe('direct@example.com')
  })

  it('maps teamIds from agent_teams array', () => {
    const out = transformUser({ id: 303, agent_teams: [{ id: 5 }, { id: 6 }] })
    expect(out.teamIds).toEqual(['5', '6'])
  })

  it('returns empty teamIds when agent_teams is absent', () => {
    const out = transformUser({ id: 304 })
    expect(out.teamIds).toEqual([])
  })

  it('does not throw on minimal input', () => {
    expect(() => transformUser({ id: 0 })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformTag
// ---------------------------------------------------------------------------

describe('Deskpro transformTag', () => {
  it('maps id and label as name', () => {
    const out = transformTag({ id: 10, label: 'billing' })
    expect(out.id).toBe('10')
    expect(out.name).toBe('billing')
    expect(out.platform).toBe('deskpro')
  })

  it('falls back name to string id when label is absent', () => {
    const out = transformTag({ id: 11 })
    expect(out.name).toBe('11')
  })

  it('preserves color in metadata', () => {
    const out = transformTag({ id: 12, label: 'vip', color: '#FF0000' })
    expect(out.metadata['color']).toBe('#FF0000')
  })

  it('raw is preserved', () => {
    const raw = { id: 13, label: 'test' }
    const out = transformTag(raw)
    expect(out.raw).toBe(raw)
  })

  it('does not throw on minimal input', () => {
    expect(() => transformTag({ id: 0 })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformTeam
// ---------------------------------------------------------------------------

describe('Deskpro transformTeam', () => {
  it('maps id and title as name', () => {
    const out = transformTeam({ id: 400, title: 'Support Department' })
    expect(out.id).toBe('400')
    expect(out.name).toBe('Support Department')
    expect(out.platform).toBe('deskpro')
  })

  it('falls back name to string id when title is absent', () => {
    const out = transformTeam({ id: 401 })
    expect(out.name).toBe('401')
  })

  it('preserves description in metadata', () => {
    const out = transformTeam({ id: 402, title: 'Engineering', description: 'Engineering support team' })
    expect(out.metadata['description']).toBe('Engineering support team')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformTeam({ id: 0 })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformMacro
// ---------------------------------------------------------------------------

describe('Deskpro transformMacro', () => {
  it('maps id and title', () => {
    const out = transformMacro({ id: 500, title: 'Welcome Reply' })
    expect(out.id).toBe('500')
    expect(out.title).toBe('Welcome Reply')
    expect(out.platform).toBe('deskpro')
  })

  it('maps body from body field', () => {
    const out = transformMacro({ id: 501, title: 'Snippet', body: 'Plain text body' })
    expect(out.body).toBe('Plain text body')
  })

  it('falls back body to body_html when body is absent', () => {
    const out = transformMacro({ id: 502, title: 'HTML Snippet', body_html: '<p>Hello</p>' })
    expect(out.body).toBe('<p>Hello</p>')
  })

  it('maps category from snippet_category object', () => {
    const out = transformMacro({ id: 503, title: 'Cat Snippet', snippet_category: { title: 'Greetings' } })
    expect(out.category).toBe('Greetings')
  })

  it('maps category from snippet_category string', () => {
    const out = transformMacro({ id: 504, title: 'Cat Snippet 2', snippet_category: 'Farewells' })
    expect(out.category).toBe('Farewells')
  })

  it('raw is preserved', () => {
    const raw = { id: 505, title: 'Raw Macro' }
    const out = transformMacro(raw)
    expect(out.raw).toBe(raw)
  })

  it('does not throw on minimal input', () => {
    expect(() => transformMacro({ id: 0 })).not.toThrow()
  })
})
