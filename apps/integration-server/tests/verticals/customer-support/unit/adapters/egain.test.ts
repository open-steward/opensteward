import { describe, it, expect } from 'vitest'
import { EgainAdapter } from '../../../../../src/verticals/customer-support/adapters/egain'
import { transformTicket, type RawEgainCase } from '../../../../../src/verticals/customer-support/adapters/egain/transform/ticket'
import { transformMessage, type RawEgainActivity } from '../../../../../src/verticals/customer-support/adapters/egain/transform/message'
import { transformContact, type RawEgainCustomer } from '../../../../../src/verticals/customer-support/adapters/egain/transform/contact'
import { transformUser, type RawEgainUser } from '../../../../../src/verticals/customer-support/adapters/egain/transform/user'
import { transformTeam, type RawEgainGroup } from '../../../../../src/verticals/customer-support/adapters/egain/transform/team'
import { buildAuthUrl } from '../../../../../src/verticals/customer-support/adapters/egain/auth'

// ── Adapter construction + getAuthUrl ─────────────────────────────────────────

describe('EgainAdapter construction', () => {
  it('uses tenantId from config in getAuthUrl', () => {
    const adapter = new EgainAdapter({
      clientId: 'cid',
      clientSecret: 'csec',
      redirectUri: 'https://example.com/callback',
      tenantId: 'ACME123',
      tenantHost: 'acme.egain.cloud',
    })
    const url = adapter.getAuthUrl('state-abc')
    expect(url).toContain('ACME123')
    expect(url).toContain('state-abc')
    expect(url).toContain('cid')
  })

  it('getAuthUrlForTenant uses the supplied tenantId', () => {
    const adapter = new EgainAdapter({
      clientId: 'cid',
      clientSecret: 'csec',
      redirectUri: 'https://example.com/callback',
    })
    const url = adapter.getAuthUrlForTenant('s1', 'TENANT456')
    expect(url).toContain('TENANT456')
  })

  it('platform is egain', () => {
    const adapter = new EgainAdapter({ clientId: 'x', clientSecret: 'y', redirectUri: 'z' })
    expect(adapter.platform).toBe('egain')
  })
})

// ── buildAuthUrl ─────────────────────────────────────────────────────────────

describe('buildAuthUrl', () => {
  it('produces a well-formed URL with correct tenant path', () => {
    const url = buildAuthUrl('client1', 'https://cb', ['core.casemgr.read'], 'mystate', 'TENANT1')
    expect(url).toContain('ai.egain.cloud')
    expect(url).toContain('TENANT1')
    expect(url).toContain('response_type=code')
    expect(url).toContain('client_id=client1')
    expect(url).toContain('state=mystate')
  })
})

// ── transformTicket ───────────────────────────────────────────────────────────

describe('transformTicket', () => {
  const rawOpen: RawEgainCase = {
    id: 101,
    subject: 'Login problem',
    status: { value: 'open', displayValue: 'Open' },
    customer: { id: 55, customerName: 'Acme Corp' },
    created: { date: '2026-01-15T09:00:00Z' },
    lastModified: { date: '2026-01-20T12:00:00Z' },
    assignedTo: { id: 7, name: 'Agent Alice' },
    department: { id: 2, name: 'Support' },
  }

  it('maps id and platform', () => {
    const t = transformTicket(rawOpen)
    expect(t.id).toBe('101')
    expect(t.platform).toBe('egain')
  })

  it('maps open status', () => {
    expect(transformTicket(rawOpen).status).toBe('open')
  })

  it('maps closed status', () => {
    const t = transformTicket({ ...rawOpen, status: { value: 'closed' } })
    expect(t.status).toBe('closed')
  })

  it('maps resolved status', () => {
    const t = transformTicket({ ...rawOpen, status: { value: 'resolved' } })
    expect(t.status).toBe('resolved')
  })

  it('maps pending status', () => {
    const t = transformTicket({ ...rawOpen, status: { value: 'pending' } })
    expect(t.status).toBe('pending')
  })

  it('defaults unknown status to open', () => {
    const t = transformTicket({ ...rawOpen, status: { value: 'custom_status' } })
    expect(t.status).toBe('open')
  })

  it('maps dates to ISO-8601', () => {
    const t = transformTicket(rawOpen)
    expect(t.createdAt).toBe('2026-01-15T09:00:00.000Z')
    expect(t.updatedAt).toBe('2026-01-20T12:00:00.000Z')
  })

  it('populates requesterId from customer', () => {
    expect(transformTicket(rawOpen).requesterId).toBe('55')
  })

  it('populates assigneeId and teamId', () => {
    const t = transformTicket(rawOpen)
    expect(t.assigneeId).toBe('7')
    expect(t.teamId).toBe('2')
  })

  it('includes metadata strings', () => {
    const t = transformTicket(rawOpen)
    expect(t.metadata['customerName']).toBe('Acme Corp')
    expect(t.metadata['assigneeName']).toBe('Agent Alice')
    expect(t.metadata['departmentName']).toBe('Support')
  })

  it('attaches raw', () => {
    expect(transformTicket(rawOpen).raw).toBe(rawOpen)
  })

  it('handles missing customer', () => {
    const t = transformTicket({ id: 1 })
    expect(t.requesterId).toBe('')
    expect(t.assigneeId).toBeUndefined()
    expect(t.teamId).toBeUndefined()
  })
})

// ── transformMessage ──────────────────────────────────────────────────────────

describe('transformMessage', () => {
  const rawActivity: RawEgainActivity = {
    id: 501,
    type: { value: 'email', displayValue: 'Email' },
    subject: 'Re: login problem',
    created: {
      date: '2026-01-16T10:00:00Z',
      user: { id: 7, name: 'Agent Alice' },
    },
    customer: { id: 55, customerName: 'Acme Corp' },
    mode: { value: 'inbound' },
    priority: 'normal',
    department: { id: 2, name: 'Support' },
    userLastWorked: { id: 7, name: 'Agent Alice' },
  }

  it('maps id and platform', () => {
    const m = transformMessage(rawActivity, '101')
    expect(m.id).toBe('501')
    expect(m.platform).toBe('egain')
  })

  it('maps ticketId', () => {
    expect(transformMessage(rawActivity, '101').ticketId).toBe('101')
  })

  it('maps public type for email', () => {
    expect(transformMessage(rawActivity, '101').type).toBe('public')
  })

  it('maps internal type for note', () => {
    const m = transformMessage({ ...rawActivity, type: { value: 'note' } }, '101')
    expect(m.type).toBe('internal')
  })

  it('uses body from subject (schema-firewall)', () => {
    expect(transformMessage(rawActivity, '101').body).toBe('Re: login problem')
  })

  it('maps author from created.user', () => {
    expect(transformMessage(rawActivity, '101').authorId).toBe('7')
  })

  it('attaches raw', () => {
    expect(transformMessage(rawActivity, '101').raw).toBe(rawActivity)
  })
})

// ── transformContact ──────────────────────────────────────────────────────────

describe('transformContact', () => {
  const rawCustomer: RawEgainCustomer = {
    id: 55,
    customerName: 'Acme Corp',
    type: { value: 'B2B' },
    level: 'gold',
    contactPersons: {
      contactPerson: [
        {
          id: 200,
          firstName: 'Jane',
          lastName: 'Doe',
          contactPoints: {
            contactPoint: [
              { type: 'email', email: { emailAddress: 'jane@acme.com' } },
              { type: 'phone', phone: { phoneNo: '555-1234', countryCode: '1', areaCode: '212' } },
            ],
          },
        },
      ],
    },
  }

  it('maps id and platform', () => {
    const c = transformContact(rawCustomer)
    expect(c.id).toBe('55')
    expect(c.platform).toBe('egain')
  })

  it('extracts email from contactPoints', () => {
    expect(transformContact(rawCustomer).email).toBe('jane@acme.com')
  })

  it('extracts phone number with country and area code', () => {
    expect(transformContact(rawCustomer).phone).toContain('555-1234')
  })

  it('uses customerName as name', () => {
    expect(transformContact(rawCustomer).name).toBe('Acme Corp')
  })

  it('falls back to first/last name when customerName absent', () => {
    const raw: RawEgainCustomer = {
      id: 1,
      contactPersons: { contactPerson: [{ firstName: 'Bob', lastName: 'Smith' }] },
    }
    expect(transformContact(raw).name).toBe('Bob Smith')
  })

  it('attaches raw', () => {
    expect(transformContact(rawCustomer).raw).toBe(rawCustomer)
  })

  it('handles customer with no contact persons', () => {
    const c = transformContact({ id: 9, customerName: 'Solo' })
    expect(c.email).toBeUndefined()
    expect(c.phone).toBeUndefined()
    expect(c.name).toBe('Solo')
  })
})

// ── transformUser ─────────────────────────────────────────────────────────────

describe('transformUser', () => {
  const rawUser: RawEgainUser = {
    id: 7,
    firstName: 'Agent',
    lastName: 'Alice',
    emailAddress: 'alice@company.com',
    status: { value: 'active', displayValue: 'Active' },
    department: { id: 2, name: 'Support' },
    groups: {
      group: [
        { id: 10, name: 'Tier1' },
        { id: 11, name: 'Tier2' },
      ],
    },
  }

  it('maps id and platform', () => {
    const u = transformUser(rawUser)
    expect(u.id).toBe('7')
    expect(u.platform).toBe('egain')
  })

  it('builds name from firstName + lastName', () => {
    expect(transformUser(rawUser).name).toBe('Agent Alice')
  })

  it('maps email', () => {
    expect(transformUser(rawUser).email).toBe('alice@company.com')
  })

  it('maps group ids to teamIds', () => {
    expect(transformUser(rawUser).teamIds).toEqual(['10', '11'])
  })

  it('attaches raw', () => {
    expect(transformUser(rawUser).raw).toBe(rawUser)
  })
})

// ── transformTeam ─────────────────────────────────────────────────────────────

describe('transformTeam', () => {
  const rawGroup: RawEgainGroup = {
    id: 10,
    name: 'Tier1',
    department: { id: 2, name: 'Support' },
  }

  it('maps id and platform', () => {
    const t = transformTeam(rawGroup)
    expect(t.id).toBe('10')
    expect(t.platform).toBe('egain')
  })

  it('maps name', () => {
    expect(transformTeam(rawGroup).name).toBe('Tier1')
  })

  it('includes departmentName in metadata', () => {
    expect(transformTeam(rawGroup).metadata['departmentName']).toBe('Support')
  })

  it('attaches raw', () => {
    expect(transformTeam(rawGroup).raw).toBe(rawGroup)
  })
})
