import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/teamsupport/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/teamsupport/transform/message'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/teamsupport/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/teamsupport/transform/user'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/teamsupport/transform/team'

// ---------------------------------------------------------------------------
// transformTicket
// ---------------------------------------------------------------------------

describe('TeamSupport transformTicket', () => {
  it('maps id and externalId', () => {
    const out = transformTicket({ ID: 42, Name: 'Test ticket' })
    expect(out.id).toBe('42')
    expect(out.externalId).toBe('42')
    expect(out.platform).toBe('teamsupport')
  })

  it('maps TicketNumber to number field', () => {
    const out = transformTicket({ ID: 1, TicketNumber: 1042 })
    expect(out.number).toBe('1042')
  })

  it('status: "Open" → open', () => {
    const out = transformTicket({ ID: 1, Status: 'Open' })
    expect(out.status).toBe('open')
  })

  it('status: "New" → open', () => {
    const out = transformTicket({ ID: 1, Status: 'New' })
    expect(out.status).toBe('open')
  })

  it('status: "Pending" → pending', () => {
    const out = transformTicket({ ID: 1, Status: 'Pending' })
    expect(out.status).toBe('pending')
  })

  it('status: "In Progress" → in_progress', () => {
    const out = transformTicket({ ID: 1, Status: 'In Progress' })
    expect(out.status).toBe('in_progress')
  })

  it('status: "On Hold" → on_hold', () => {
    const out = transformTicket({ ID: 1, Status: 'On Hold' })
    expect(out.status).toBe('on_hold')
  })

  it('status: "Resolved" → resolved (distinct from closed)', () => {
    // resolved must NOT collapse to closed — they are distinct canonical statuses
    const out = transformTicket({ ID: 1, Status: 'Resolved', IsClosed: false })
    expect(out.status).toBe('resolved')
  })

  it('status: "Closed" → closed', () => {
    const out = transformTicket({ ID: 1, Status: 'Closed' })
    expect(out.status).toBe('closed')
  })

  it('IsClosed=true overrides status to closed', () => {
    const out = transformTicket({ ID: 1, Status: 'Open', IsClosed: true })
    expect(out.status).toBe('closed')
  })

  it('IsClosed="True" (string) overrides status to closed', () => {
    const out = transformTicket({ ID: 1, Status: 'Open', IsClosed: 'True' })
    expect(out.status).toBe('closed')
  })

  it('resolvedAt is set when status is resolved', () => {
    const out = transformTicket({
      ID: 2,
      Status: 'Resolved',
      IsClosed: false,
      DateClosed: '2026-02-01T14:20:00Z',
    })
    expect(out.status).toBe('resolved')
    expect(out.resolvedAt).toBe('2026-02-01T14:20:00.000Z')
  })

  it('resolvedAt is set when status is closed', () => {
    const out = transformTicket({
      ID: 3,
      Status: 'Closed',
      DateClosed: '2026-02-02T10:00:00Z',
    })
    expect(out.status).toBe('closed')
    expect(out.resolvedAt).toBe('2026-02-02T10:00:00.000Z')
  })

  it('resolvedAt is undefined for open tickets', () => {
    const out = transformTicket({ ID: 4, Status: 'Open' })
    expect(out.resolvedAt).toBeUndefined()
  })

  it('closedAt is set from DateClosed', () => {
    const out = transformTicket({ ID: 5, Status: 'Closed', DateClosed: '2026-03-01T00:00:00Z' })
    expect(out.closedAt).toBe('2026-03-01T00:00:00.000Z')
  })

  it('closedAt is undefined when DateClosed is absent', () => {
    const out = transformTicket({ ID: 6, Status: 'Open' })
    expect(out.closedAt).toBeUndefined()
  })

  it('priority: Severity "High" → high', () => {
    const out = transformTicket({ ID: 10, Severity: 'High' })
    expect(out.priority).toBe('high')
  })

  it('priority: Severity "Normal" → normal', () => {
    const out = transformTicket({ ID: 11, Severity: 'Normal' })
    expect(out.priority).toBe('normal')
  })

  it('priority: Severity "Low" → low', () => {
    const out = transformTicket({ ID: 12, Severity: 'Low' })
    expect(out.priority).toBe('low')
  })

  it('priority: Severity "Critical" → urgent', () => {
    const out = transformTicket({ ID: 13, Severity: 'Critical' })
    expect(out.priority).toBe('urgent')
  })

  it('priority: unknown Severity → undefined', () => {
    const out = transformTicket({ ID: 14, Severity: 'Mystery' })
    expect(out.priority).toBeUndefined()
  })

  it('channel: email → email', () => {
    const out = transformTicket({ ID: 20, TicketSource: 'Email' })
    expect(out.channel).toBe('email')
  })

  it('channel: Chat → chat', () => {
    const out = transformTicket({ ID: 21, TicketSource: 'Chat' })
    expect(out.channel).toBe('chat')
  })

  it('channel: Phone → voice', () => {
    const out = transformTicket({ ID: 22, TicketSource: 'Phone' })
    expect(out.channel).toBe('voice')
  })

  it('channel: Portal → web', () => {
    const out = transformTicket({ ID: 23, TicketSource: 'Portal' })
    expect(out.channel).toBe('web')
  })

  it('channel: unknown → other', () => {
    const out = transformTicket({ ID: 24, TicketSource: 'Carrier Pigeon' })
    expect(out.channel).toBe('other')
  })

  it('maps requesterId from OrganizationID', () => {
    const out = transformTicket({ ID: 30, OrganizationID: 99 })
    expect(out.requesterId).toBe('99')
  })

  it('maps assigneeId from UserID', () => {
    const out = transformTicket({ ID: 31, UserID: 7 })
    expect(out.assigneeId).toBe('7')
  })

  it('maps teamId from GroupID', () => {
    const out = transformTicket({ ID: 32, GroupID: 3 })
    expect(out.teamId).toBe('3')
  })

  it('maps parentTicketId from ParentID', () => {
    const out = transformTicket({ ID: 33, ParentID: 1000 })
    expect(out.parentTicketId).toBe('1000')
  })

  it('createdAt is ISO-8601 from DateCreated', () => {
    const out = transformTicket({ ID: 40, DateCreated: '2026-01-15T09:30:00Z' })
    expect(out.createdAt).toBe('2026-01-15T09:30:00.000Z')
  })

  it('createdAt defaults to epoch when DateCreated is absent', () => {
    const out = transformTicket({ ID: 41 })
    expect(out.createdAt).toBe(new Date(0).toISOString())
  })

  it('tagIds is always an empty array (TeamSupport has no tag concept)', () => {
    const out = transformTicket({ ID: 50 })
    expect(Array.isArray(out.tagIds)).toBe(true)
    expect(out.tagIds).toEqual([])
  })

  it('raw is preserved', () => {
    const raw = { ID: 99, Name: 'raw check' }
    const out = transformTicket(raw)
    expect(out.raw).toBe(raw)
  })

  it('does not throw on minimal input', () => {
    expect(() => transformTicket({ ID: 0 })).not.toThrow()
  })

  it('does not throw on non-string Status', () => {
    expect(() => transformTicket({ ID: 0, Status: undefined })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformMessage
// ---------------------------------------------------------------------------

describe('TeamSupport transformMessage', () => {
  it('maps id and ticketId', () => {
    const out = transformMessage({ ID: 100 }, 'tkt-1')
    expect(out.id).toBe('100')
    expect(out.ticketId).toBe('tkt-1')
    expect(out.platform).toBe('teamsupport')
  })

  it('type: "Private Comment" → internal', () => {
    const out = transformMessage({ ID: 101, ActionType: 'Private Comment' }, 'tkt-1')
    expect(out.type).toBe('internal')
  })

  it('type: "Note" → internal', () => {
    const out = transformMessage({ ID: 102, ActionType: 'note' }, 'tkt-1')
    expect(out.type).toBe('internal')
  })

  it('type: IsPublic=false → internal', () => {
    const out = transformMessage({ ID: 103, ActionType: 'Public Comment', IsPublic: false }, 'tkt-1')
    expect(out.type).toBe('internal')
  })

  it('type: "Public Comment" → public', () => {
    const out = transformMessage({ ID: 104, ActionType: 'Public Comment' }, 'tkt-1')
    expect(out.type).toBe('public')
  })

  it('authorType: UserID present → user', () => {
    const out = transformMessage({ ID: 110, UserID: 5 }, 'tkt-2')
    expect(out.authorType).toBe('user')
    expect(out.authorId).toBe('5')
  })

  it('authorType: no UserID, CreatorID present → contact', () => {
    const out = transformMessage({ ID: 111, UserID: null, CreatorID: 99 }, 'tkt-2')
    expect(out.authorType).toBe('contact')
    expect(out.authorId).toBe('99')
  })

  it('authorType: neither UserID nor CreatorID → system', () => {
    const out = transformMessage({ ID: 112 }, 'tkt-2')
    expect(out.authorType).toBe('system')
  })

  it('body uses Description when present', () => {
    const out = transformMessage({ ID: 120, Description: 'Hello World', Name: 'Subject' }, 'tkt-3')
    expect(out.body).toBe('Hello World')
  })

  it('body falls back to Name when Description absent', () => {
    const out = transformMessage({ ID: 121, Name: 'Subject only' }, 'tkt-3')
    expect(out.body).toBe('Subject only')
  })

  it('createdAt is ISO-8601 from DateCreated', () => {
    const out = transformMessage({ ID: 130, DateCreated: '2026-03-01T12:00:00Z' }, 'tkt-4')
    expect(out.createdAt).toBe('2026-03-01T12:00:00.000Z')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformMessage({ ID: 0 }, 'tkt-min')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformContact
// ---------------------------------------------------------------------------

describe('TeamSupport transformContact', () => {
  it('maps id, email, phone, name', () => {
    const out = transformContact({
      ID: 200,
      FirstName: 'Jane',
      LastName: 'Doe',
      Email: 'jane@example.com',
      Phone: '555-1234',
    })
    expect(out.id).toBe('200')
    expect(out.email).toBe('jane@example.com')
    expect(out.phone).toBe('555-1234')
    expect(out.name).toBe('Jane Doe')
    expect(out.platform).toBe('teamsupport')
  })

  it('name is empty string when no name fields', () => {
    const out = transformContact({ ID: 201 })
    expect(out.name).toBe('')
  })

  it('maps organizationId from OrganizationID', () => {
    const out = transformContact({ ID: 202, OrganizationID: 10 })
    expect(out.organizationId).toBe('10')
  })

  it('organizationId is undefined when absent', () => {
    const out = transformContact({ ID: 203 })
    expect(out.organizationId).toBeUndefined()
  })

  it('does not throw on minimal input', () => {
    expect(() => transformContact({ ID: 0 })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformUser
// ---------------------------------------------------------------------------

describe('TeamSupport transformUser', () => {
  it('maps id, email, name', () => {
    const out = transformUser({
      ID: 300,
      FirstName: 'Alice',
      LastName: 'Agent',
      Email: 'alice@example.com',
    })
    expect(out.id).toBe('300')
    expect(out.email).toBe('alice@example.com')
    expect(out.name).toBe('Alice Agent')
    expect(out.platform).toBe('teamsupport')
  })

  it('maps teamIds from DefaultSupportGroupID', () => {
    const out = transformUser({ ID: 301, DefaultSupportGroupID: 4 })
    expect(out.teamIds).toEqual(['4'])
  })

  it('teamIds is empty when DefaultSupportGroupID absent', () => {
    const out = transformUser({ ID: 302 })
    expect(out.teamIds).toEqual([])
  })

  it('maps role from AdminLevel', () => {
    const out = transformUser({ ID: 303, AdminLevel: 'Admin' })
    expect(out.role).toBe('Admin')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformUser({ ID: 0 })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformTeam
// ---------------------------------------------------------------------------

describe('TeamSupport transformTeam', () => {
  it('maps id and name', () => {
    const out = transformTeam({ ID: 400, Name: 'Support Team' })
    expect(out.id).toBe('400')
    expect(out.name).toBe('Support Team')
    expect(out.platform).toBe('teamsupport')
  })

  it('puts Description in metadata', () => {
    const out = transformTeam({ ID: 401, Name: 'L2', Description: 'Level 2 support' })
    expect(out.metadata['Description']).toBe('Level 2 support')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformTeam({ ID: 0 })).not.toThrow()
  })
})
