import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/jira-service-management/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/jira-service-management/transform/message'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/jira-service-management/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/jira-service-management/transform/user'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/jira-service-management/transform/team'

// ---------------------------------------------------------------------------
// transformTicket
// ---------------------------------------------------------------------------

describe('jira-service-management transformTicket', () => {
  it('maps an open request to status=open', () => {
    const out = transformTicket({
      issueId: '10001',
      issueKey: 'IT-1',
      summary: 'Cannot access VPN',
      serviceDeskId: '1',
      requestTypeId: '5',
      createdDate: { iso8601: '2026-01-01T10:00:00.000Z', epochMillis: 1735725600000 },
      currentStatus: { status: 'Open', statusCategory: 'To Do' },
      reporter: { accountId: 'acc-001', displayName: 'Alice', emailAddress: 'alice@example.com' },
    })
    expect(out.id).toBe('10001')
    expect(out.externalId).toBe('10001')
    expect(out.number).toBe('IT-1')
    expect(out.subject).toBe('Cannot access VPN')
    expect(out.platform).toBe('jira-service-management')
    expect(out.status).toBe('open')
    expect(out.requesterId).toBe('acc-001')
    expect(out.teamId).toBe('1')
    expect(out.createdAt).toBe('2026-01-01T10:00:00.000Z')
    expect(out.resolvedAt).toBeUndefined()
    expect(out.raw).toBeDefined()
  })

  it('maps a closed request to status=closed', () => {
    const out = transformTicket({
      issueId: '10002',
      issueKey: 'IT-2',
      summary: 'Password reset',
      currentStatus: { status: 'Closed', statusCategory: 'Done' },
      createdDate: { iso8601: '2026-01-02T08:00:00.000Z' },
    })
    expect(out.status).toBe('closed')
    expect(out.resolvedAt).toBeDefined()
  })

  it('maps a done-category request to status=resolved', () => {
    const out = transformTicket({
      issueId: '10003',
      issueKey: 'IT-3',
      summary: 'Laptop request fulfilled',
      currentStatus: { status: 'Resolved', statusCategory: 'Done' },
      createdDate: { iso8601: '2026-01-03T09:00:00.000Z' },
    })
    expect(out.status).toBe('resolved')
  })

  it('maps a waiting/pending request to status=pending', () => {
    const out = transformTicket({
      issueId: '10004',
      issueKey: 'IT-4',
      summary: 'Waiting for customer',
      currentStatus: { status: 'Waiting for Customer', statusCategory: 'To Do' },
      createdDate: { iso8601: '2026-01-04T09:00:00.000Z' },
    })
    expect(out.status).toBe('pending')
  })

  it('maps an in-progress request correctly', () => {
    const out = transformTicket({
      issueId: '10005',
      issueKey: 'IT-5',
      summary: 'In progress ticket',
      currentStatus: { status: 'In Progress', statusCategory: 'In Progress' },
      createdDate: { iso8601: '2026-01-05T09:00:00.000Z' },
    })
    expect(out.status).toBe('in_progress')
  })

  it('returns platform=jira-service-management and tagIds=[]', () => {
    const out = transformTicket({ issueId: '99', summary: 'Test' })
    expect(out.platform).toBe('jira-service-management')
    expect(out.tagIds).toEqual([])
  })

  it('does not throw on completely empty input', () => {
    expect(() => transformTicket({})).not.toThrow()
  })

  it('falls back to issueKey when issueId is absent', () => {
    const out = transformTicket({ issueKey: 'IT-42', summary: 'Key fallback' })
    expect(out.id).toBe('IT-42')
  })

  it('maps priority from requestFieldValues', () => {
    const out = transformTicket({
      issueId: '20001',
      issueKey: 'IT-100',
      summary: 'High priority request',
      requestFieldValues: [
        { fieldId: 'priority', label: 'Priority', value: 'High' },
      ],
    })
    expect(out.priority).toBe('high')
  })

  // Guard: statusCategory=done with a name containing 'clos' must map to
  // closed regardless of operator precedence
  it('maps done+clos combination to closed', () => {
    const out = transformTicket({
      issueId: '30001',
      issueKey: 'IT-200',
      summary: 'Closing via category',
      currentStatus: { status: 'Closing', statusCategory: 'done' },
      createdDate: { iso8601: '2026-02-01T00:00:00.000Z' },
    })
    expect(out.status).toBe('closed')
  })
})

// ---------------------------------------------------------------------------
// transformMessage
// ---------------------------------------------------------------------------

describe('jira-service-management transformMessage', () => {
  it('maps a public comment correctly', () => {
    const out = transformMessage(
      {
        id: 'cmt-1',
        body: 'We are looking into this.',
        public: true,
        author: { accountId: 'agent-001', displayName: 'Bob Agent', emailAddress: 'bob@example.com' },
        created: { iso8601: '2026-01-10T12:00:00.000Z' },
      },
      'ticket-10001',
    )
    expect(out.id).toBe('cmt-1')
    expect(out.externalId).toBe('cmt-1')
    expect(out.ticketId).toBe('ticket-10001')
    expect(out.authorId).toBe('agent-001')
    expect(out.type).toBe('public')
    expect(out.body).toBe('We are looking into this.')
    expect(out.platform).toBe('jira-service-management')
    expect(out.createdAt).toBe('2026-01-10T12:00:00.000Z')
    expect(out.raw).toBeDefined()
  })

  it('maps an internal note (public=false) to type=internal', () => {
    const out = transformMessage(
      { id: 'cmt-2', body: 'Internal only.', public: false },
      'ticket-10001',
    )
    expect(out.type).toBe('internal')
  })

  it('does not throw on empty input', () => {
    expect(() => transformMessage({}, 'tid')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformContact
// ---------------------------------------------------------------------------

describe('jira-service-management transformContact', () => {
  it('maps a customer to canonical Contact', () => {
    const out = transformContact({
      accountId: 'cust-001',
      displayName: 'Charlie Customer',
      emailAddress: 'charlie@example.com',
      active: true,
      timeZone: 'Europe/Stockholm',
    })
    expect(out.id).toBe('cust-001')
    expect(out.externalId).toBe('cust-001')
    expect(out.email).toBe('charlie@example.com')
    expect(out.name).toBe('Charlie Customer')
    expect(out.phone).toBeUndefined()
    expect(out.platform).toBe('jira-service-management')
    expect(out.raw).toBeDefined()
  })

  it('falls back to legacy name field when accountId is absent', () => {
    const out = transformContact({ name: 'legacy-name', emailAddress: 'x@x.com' })
    expect(out.id).toBe('legacy-name')
  })

  it('does not throw on empty input', () => {
    expect(() => transformContact({})).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformUser
// ---------------------------------------------------------------------------

describe('jira-service-management transformUser', () => {
  it('maps a Jira user (agent) to canonical User', () => {
    const out = transformUser({
      accountId: 'agent-007',
      displayName: 'Diana Agent',
      emailAddress: 'diana@example.com',
      accountType: 'atlassian',
      active: true,
    })
    expect(out.id).toBe('agent-007')
    expect(out.externalId).toBe('agent-007')
    expect(out.email).toBe('diana@example.com')
    expect(out.name).toBe('Diana Agent')
    expect(out.platform).toBe('jira-service-management')
    expect(out.teamIds).toEqual([])
    expect(out.raw).toBeDefined()
  })

  it('does not throw on empty input', () => {
    expect(() => transformUser({})).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformTeam
// ---------------------------------------------------------------------------

describe('jira-service-management transformTeam', () => {
  it('maps a ServiceDeskDTO to canonical Team', () => {
    const out = transformTeam({
      id: '1',
      projectId: '11001',
      projectName: 'IT Help Desk',
      projectKey: 'ITH',
    })
    expect(out.id).toBe('1')
    expect(out.externalId).toBe('1')
    expect(out.name).toBe('IT Help Desk')
    expect(out.platform).toBe('jira-service-management')
    expect(out.raw).toBeDefined()
  })

  it('falls back to id string when projectName is absent', () => {
    const out = transformTeam({ id: '42' })
    expect(out.id).toBe('42')
    expect(out.name).toBe('42')
  })

  it('does not throw on empty input', () => {
    expect(() => transformTeam({})).not.toThrow()
  })
})
