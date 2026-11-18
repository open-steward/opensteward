import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/connectwise-psa/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/connectwise-psa/transform/message'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/connectwise-psa/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/connectwise-psa/transform/user'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/connectwise-psa/transform/team'
import {
  verifyConnectwisePsaWebhook,
  parseConnectwisePsaWebhookEvents,
} from '../../../../../src/verticals/customer-support/adapters/connectwise-psa/webhook'
import { exchangeCredentials } from '../../../../../src/verticals/customer-support/adapters/connectwise-psa/auth'

// ---------------------------------------------------------------------------
// transformTicket
// ---------------------------------------------------------------------------

describe('ConnectWise PSA transformTicket', () => {
  it('maps id correctly', () => {
    const out = transformTicket({ id: 42, summary: 'Printer broken' })
    expect(out.id).toBe('42')
    expect(out.externalId).toBe('42')
    expect(out.number).toBe('42')
  })

  it('maps subject from summary', () => {
    const out = transformTicket({ id: 1, summary: 'Login issue' })
    expect(out.subject).toBe('Login issue')
  })

  it('maps status: closed when closedFlag=true', () => {
    const out = transformTicket({ id: 2, closedFlag: true, status: { name: 'Open' } })
    expect(out.status).toBe('closed')
  })

  it('maps status: open via status.name containing "new"', () => {
    const out = transformTicket({ id: 3, status: { name: 'New' } })
    expect(out.status).toBe('open')
  })

  it('maps status: in_progress via status.name containing "in progress"', () => {
    const out = transformTicket({ id: 4, status: { name: 'In Progress' } })
    expect(out.status).toBe('in_progress')
  })

  it('maps status: pending via status.name containing "waiting"', () => {
    const out = transformTicket({ id: 5, status: { name: 'Waiting Customer' } })
    expect(out.status).toBe('pending')
  })

  it('maps status: resolved via status.name containing "resolved"', () => {
    const out = transformTicket({ id: 6, status: { name: 'Resolved' } })
    expect(out.status).toBe('resolved')
  })

  it('maps priority: urgent when sort=1', () => {
    const out = transformTicket({ id: 10, priority: { sort: 1, name: 'P1' } })
    expect(out.priority).toBe('urgent')
  })

  it('maps priority: urgent from name "critical"', () => {
    const out = transformTicket({ id: 11, priority: { sort: 5, name: 'Critical' } })
    expect(out.priority).toBe('urgent')
  })

  it('maps priority: high when sort=2', () => {
    const out = transformTicket({ id: 12, priority: { sort: 2, name: 'High' } })
    expect(out.priority).toBe('high')
  })

  it('maps priority: normal when sort=3', () => {
    const out = transformTicket({ id: 13, priority: { sort: 3, name: 'Medium' } })
    expect(out.priority).toBe('normal')
  })

  it('maps priority: low when sort=4', () => {
    const out = transformTicket({ id: 14, priority: { sort: 4, name: 'Low' } })
    expect(out.priority).toBe('low')
  })

  it('returns undefined priority when name is unrecognised', () => {
    const out = transformTicket({ id: 15, priority: { name: 'Unknown Priority' } })
    expect(out.priority).toBeUndefined()
  })

  it('maps requesterId from contact.id', () => {
    const out = transformTicket({ id: 16, contact: { id: 77 } })
    expect(out.requesterId).toBe('77')
  })

  it('maps assigneeId from owner.id', () => {
    const out = transformTicket({ id: 17, owner: { id: 22 } })
    expect(out.assigneeId).toBe('22')
  })

  it('maps teamId from team.id', () => {
    const out = transformTicket({ id: 18, team: { id: 5 } })
    expect(out.teamId).toBe('5')
  })

  it('tagIds is always empty array', () => {
    const out = transformTicket({ id: 19 })
    expect(out.tagIds).toEqual([])
  })

  it('createdAt is ISO-8601', () => {
    const out = transformTicket({ id: 20, _info: { dateEntered: '2026-01-10T08:00:00Z' } })
    expect(out.createdAt).toBe('2026-01-10T08:00:00.000Z')
  })

  it('resolvedAt set when closedFlag=true and closedDate present', () => {
    const out = transformTicket({
      id: 21,
      closedFlag: true,
      closedDate: '2026-02-01T14:00:00Z',
    })
    expect(out.resolvedAt).toBe('2026-02-01T14:00:00.000Z')
    expect(out.closedAt).toBe('2026-02-01T14:00:00.000Z')
  })

  it('platform is always connectwise-psa', () => {
    const out = transformTicket({ id: 22 })
    expect(out.platform).toBe('connectwise-psa')
  })

  it('channel defaults to other', () => {
    const out = transformTicket({ id: 23 })
    expect(out.channel).toBe('other')
  })

  it('raw is preserved', () => {
    const raw = { id: 24, summary: 'raw check' }
    const out = transformTicket(raw)
    expect(out.raw).toBe(raw)
  })

  it('does not throw on minimal input', () => {
    expect(() => transformTicket({ id: 0 })).not.toThrow()
  })

  it('does not throw on null-ish fields', () => {
    expect(() =>
      // ConnectWise nulls out the optional associations (and closedDate on open
      // tickets); `board`/`status`/`summary` are always populated on a ticket.
      transformTicket({ id: 0, priority: null, contact: null, owner: null, team: null, closedDate: null }),
    ).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformMessage
// ---------------------------------------------------------------------------

describe('ConnectWise PSA transformMessage', () => {
  it('maps id and ticketId', () => {
    const out = transformMessage({ id: 100 }, 'ticket-55')
    expect(out.id).toBe('100')
    expect(out.ticketId).toBe('ticket-55')
  })

  it('maps type: internal when internalFlag=true', () => {
    const out = transformMessage({ id: 101, internalFlag: true }, 'tkt-1')
    expect(out.type).toBe('internal')
  })

  it('maps type: public when internalFlag=false', () => {
    const out = transformMessage({ id: 102, internalFlag: false }, 'tkt-1')
    expect(out.type).toBe('public')
  })

  it('maps type: public when internalFlag absent', () => {
    const out = transformMessage({ id: 103 }, 'tkt-1')
    expect(out.type).toBe('public')
  })

  it('uses member.id as authorId with authorType=user when member present', () => {
    const out = transformMessage({ id: 104, member: { id: 7, name: 'Agent' } }, 'tkt-2')
    expect(out.authorId).toBe('7')
    expect(out.authorType).toBe('user')
  })

  it('uses contact.id as authorId with authorType=contact when no member', () => {
    const out = transformMessage({ id: 105, contact: { id: 99, name: 'End User' } }, 'tkt-2')
    expect(out.authorId).toBe('99')
    expect(out.authorType).toBe('contact')
  })

  it('falls back to createdBy with authorType=system when neither member nor contact', () => {
    const out = transformMessage({ id: 106, createdBy: 'system-script' }, 'tkt-2')
    expect(out.authorId).toBe('system-script')
    expect(out.authorType).toBe('system')
  })

  it('maps body from text', () => {
    const out = transformMessage({ id: 107, text: 'Note content here' }, 'tkt-3')
    expect(out.body).toBe('Note content here')
  })

  it('createdAt is ISO-8601', () => {
    const out = transformMessage(
      { id: 108, _info: { dateEntered: '2026-03-15T10:00:00Z' } },
      'tkt-4',
    )
    expect(out.createdAt).toBe('2026-03-15T10:00:00.000Z')
  })

  it('platform is always connectwise-psa', () => {
    const out = transformMessage({ id: 109 }, 'tkt-5')
    expect(out.platform).toBe('connectwise-psa')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformMessage({ id: 0 }, 'tkt-min')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformContact
// ---------------------------------------------------------------------------

describe('ConnectWise PSA transformContact', () => {
  it('maps id and name from firstName + lastName', () => {
    const out = transformContact({ id: 200, firstName: 'Jane', lastName: 'Doe' })
    expect(out.id).toBe('200')
    expect(out.name).toBe('Jane Doe')
  })

  it('extracts default email from communicationItems', () => {
    const out = transformContact({
      id: 201,
      communicationItems: [
        { communicationType: 'Email', value: 'jane@example.com', defaultFlag: true },
      ],
    })
    expect(out.email).toBe('jane@example.com')
  })

  it('extracts phone from defaultPhoneNbr', () => {
    const out = transformContact({ id: 202, defaultPhoneNbr: '+1-555-0100' })
    expect(out.phone).toBe('+1-555-0100')
  })

  it('maps organizationId from company.id', () => {
    const out = transformContact({ id: 203, company: { id: 10, name: 'Acme' } })
    expect(out.organizationId).toBe('10')
  })

  it('platform is always connectwise-psa', () => {
    const out = transformContact({ id: 204 })
    expect(out.platform).toBe('connectwise-psa')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformContact({ id: 0 })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformUser
// ---------------------------------------------------------------------------

describe('ConnectWise PSA transformUser', () => {
  it('maps id and name from firstName + lastName', () => {
    const out = transformUser({ id: 300, firstName: 'Alice', lastName: 'Agent' })
    expect(out.id).toBe('300')
    expect(out.name).toBe('Alice Agent')
  })

  it('maps email from emailAddress', () => {
    const out = transformUser({ id: 301, emailAddress: 'alice@example.com' })
    expect(out.email).toBe('alice@example.com')
  })

  it('maps role from securityRole.name', () => {
    const out = transformUser({ id: 302, securityRole: { id: 1, name: 'Technician' } })
    expect(out.role).toBe('Technician')
  })

  it('maps teamIds from defaultDepartmentId', () => {
    const out = transformUser({ id: 303, defaultDepartmentId: 4 })
    expect(out.teamIds).toEqual(['4'])
  })

  it('returns empty teamIds when defaultDepartmentId absent', () => {
    const out = transformUser({ id: 304 })
    expect(out.teamIds).toEqual([])
  })

  it('platform is always connectwise-psa', () => {
    const out = transformUser({ id: 305 })
    expect(out.platform).toBe('connectwise-psa')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformUser({ id: 0 })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformTeam
// ---------------------------------------------------------------------------

describe('ConnectWise PSA transformTeam', () => {
  it('maps id and name', () => {
    const out = transformTeam({ id: 400, name: 'Tier 2 Support' })
    expect(out.id).toBe('400')
    expect(out.name).toBe('Tier 2 Support')
  })

  it('maps location and department to metadata', () => {
    const out = transformTeam({
      id: 401,
      name: 'L2',
      location: { id: 1, name: 'HQ' },
      department: { id: 2, name: 'Engineering' },
    })
    expect(out.metadata['locationName']).toBe('HQ')
    expect(out.metadata['departmentName']).toBe('Engineering')
  })

  it('platform is always connectwise-psa', () => {
    const out = transformTeam({ id: 402, name: 'Team' })
    expect(out.platform).toBe('connectwise-psa')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformTeam({ id: 0 })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

describe('ConnectWise PSA webhook', () => {
  it('verifyConnectwisePsaWebhook always returns true (no signature scheme)', () => {
    expect(verifyConnectwisePsaWebhook(Buffer.from('{}'), {}, 'secret')).toBe(true)
  })

  it('parseConnectwisePsaWebhookEvents maps Action=added to action=created', () => {
    const events = parseConnectwisePsaWebhookEvents({ Action: 'added', Type: 'ServiceTicket', ID: 123 })
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.platform).toBe('connectwise-psa')
    expect(events[0]!.resourceType).toBe('tickets')
    expect(events[0]!.resourceId).toBe('123')
  })

  it('parseConnectwisePsaWebhookEvents maps Action=updated to action=updated', () => {
    const events = parseConnectwisePsaWebhookEvents({ Action: 'updated', Type: 'Contact', ID: 55 })
    expect(events[0]!.action).toBe('updated')
    expect(events[0]!.resourceType).toBe('contacts')
  })

  it('parseConnectwisePsaWebhookEvents maps Action=deleted to action=deleted', () => {
    const events = parseConnectwisePsaWebhookEvents({ Action: 'deleted', Type: 'Member', ID: 9 })
    expect(events[0]!.action).toBe('deleted')
    expect(events[0]!.resourceType).toBe('users')
  })

  it('parseConnectwisePsaWebhookEvents maps TicketNote type to resourceType=messages', () => {
    const events = parseConnectwisePsaWebhookEvents({ Action: 'added', Type: 'TicketNote', ID: 77 })
    expect(events[0]!.resourceType).toBe('messages')
    // ticketId is undefined for note callbacks (we don't have parent ticket ID in payload)
    expect(events[0]!.ticketId).toBeUndefined()
  })

  it('parseConnectwisePsaWebhookEvents sets ticketId for ticket events', () => {
    const events = parseConnectwisePsaWebhookEvents({ Action: 'updated', Type: 'ServiceTicket', ID: 42 })
    expect(events[0]!.ticketId).toBe('42')
  })

  it('parseConnectwisePsaWebhookEvents maps unknown Action to action=unknown', () => {
    const events = parseConnectwisePsaWebhookEvents({ Action: 'archived', Type: 'ServiceTicket', ID: 1 })
    expect(events[0]!.action).toBe('unknown')
  })

  it('parseConnectwisePsaWebhookEvents returns one event per call', () => {
    const events = parseConnectwisePsaWebhookEvents({ Action: 'added', Type: 'ServiceTicket', ID: 1 })
    expect(events).toHaveLength(1)
  })

  it('parseConnectwisePsaWebhookEvents does not throw on empty payload', () => {
    expect(() => parseConnectwisePsaWebhookEvents({})).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Auth — exchangeCredentials
// ---------------------------------------------------------------------------

describe('ConnectWise PSA exchangeCredentials', () => {
  it('produces a base64-encoded accessToken', async () => {
    const creds = await exchangeCredentials({
      companyId: 'myco',
      publicKey: 'pub123',
      privateKey: 'priv456',
      clientId: 'client-xyz',
    })
    const decoded = Buffer.from(creds.accessToken, 'base64').toString('utf8')
    expect(decoded).toBe('myco+pub123:priv456')
  })

  it('stores clientId in extra', async () => {
    const creds = await exchangeCredentials({
      companyId: 'c',
      publicKey: 'p',
      privateKey: 'r',
      clientId: 'cid-001',
    })
    expect(creds.extra?.['clientId']).toBe('cid-001')
  })

  it('throws when companyId is missing', async () => {
    await expect(
      exchangeCredentials({ publicKey: 'p', privateKey: 'r', clientId: 'c' }),
    ).rejects.toThrow('companyId')
  })

  it('throws when publicKey is missing', async () => {
    await expect(
      exchangeCredentials({ companyId: 'c', privateKey: 'r', clientId: 'c' }),
    ).rejects.toThrow('publicKey')
  })
})
