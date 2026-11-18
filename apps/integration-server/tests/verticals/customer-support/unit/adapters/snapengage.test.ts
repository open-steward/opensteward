import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/snapengage/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/snapengage/transform/message'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/snapengage/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/snapengage/transform/user'
import { SnapengageAdapter } from '../../../../../src/verticals/customer-support/adapters/snapengage/index'

describe('SnapEngage transformTicket', () => {
  it('maps a minimal case to canonical Ticket', () => {
    const raw = {
      id: 'case-001',
      created_at_date: 1700000000000,
      chat_responded: true,
    }
    const ticket = transformTicket(raw)
    expect(ticket.id).toBe('case-001')
    expect(ticket.platform).toBe('snapengage')
    expect(ticket.status).toBe('resolved')
    expect(ticket.channel).toBe('chat')
    expect(ticket.createdAt).toBe('2023-11-14T22:13:20.000Z')
  })

  it('maps chat_responded=false to status=open', () => {
    const raw = { id: 'case-002', chat_responded: false, created_at_date: 1700000000000 }
    const ticket = transformTicket(raw)
    expect(ticket.status).toBe('open')
  })

  it('uses created_at_seconds when created_at_date is absent', () => {
    const raw = { id: 'case-003', created_at_seconds: 1700000000 }
    const ticket = transformTicket(raw)
    expect(ticket.createdAt).toBe('2023-11-14T22:13:20.000Z')
  })

  it('extracts labels as tagIds', () => {
    const raw = {
      id: 'case-004',
      labels: [{ name: 'billing' }, { name: 'urgent' }],
    }
    const ticket = transformTicket(raw)
    expect(ticket.tagIds).toEqual(['billing', 'urgent'])
  })

  it('normalises survey_score to satisfactionRating in range 1–5', () => {
    const raw = { id: 'case-005', survey_score: 8 }
    const ticket = transformTicket(raw)
    expect(ticket.satisfactionRating).toBeGreaterThanOrEqual(1)
    expect(ticket.satisfactionRating).toBeLessThanOrEqual(5)
  })

  it('does not throw when fields are null/undefined', () => {
    expect(() => transformTicket({})).not.toThrow()
  })

  it('sets resolvedAt when status is resolved', () => {
    const raw = { id: 'case-006', chat_responded: true, created_at_date: 1700000000000 }
    const ticket = transformTicket(raw)
    expect(ticket.resolvedAt).toBeDefined()
  })
})

describe('SnapEngage transformMessage', () => {
  it('maps a minimal transcript entry to canonical Message', () => {
    const raw = { id: 'msg-001', date: 1700000000000, alias: 'John', message: 'Hello' }
    const msg = transformMessage(raw, 'case-001')
    expect(msg.id).toBe('msg-001')
    expect(msg.platform).toBe('snapengage')
    expect(msg.ticketId).toBe('case-001')
    expect(msg.body).toBe('Hello')
    expect(msg.authorId).toBe('John')
  })

  it('maps alias=system to authorType=system', () => {
    const raw = { alias: 'System', message: 'Chat started' }
    const msg = transformMessage(raw, 'case-001')
    expect(msg.authorType).toBe('system')
  })

  it('maps alias=bot to authorType=system', () => {
    const raw = { alias: 'Bot', message: 'How can I help?' }
    const msg = transformMessage(raw, 'case-001')
    expect(msg.authorType).toBe('system')
  })

  it('maps alias=agent to authorType=user', () => {
    const raw = { alias: 'Agent', message: 'I am here to help' }
    const msg = transformMessage(raw, 'case-001')
    expect(msg.authorType).toBe('user')
  })

  it('maps matching chatAgentAlias to authorType=user', () => {
    const raw = { alias: 'SupportAgent1', message: 'Hi there' }
    const msg = transformMessage(raw, 'case-001', 'SupportAgent1')
    expect(msg.authorType).toBe('user')
  })

  it('maps unknown alias (no chatAgentAlias match) to authorType=contact', () => {
    const raw = { alias: 'Jane Visitor', message: 'Need help' }
    const msg = transformMessage(raw, 'case-001', 'SupportAgent1')
    expect(msg.authorType).toBe('contact')
  })

  it('defaults authorType to contact when alias is absent', () => {
    const raw = { message: 'No alias' }
    const msg = transformMessage(raw, 'case-001')
    expect(msg.authorType).toBe('contact')
  })

  it('derives id from ticketId and date when id is missing', () => {
    const raw = { date: 1700000000000, alias: 'User', message: 'Hello' }
    const msg = transformMessage(raw, 'case-001')
    expect(msg.id).toBe('case-001:1700000000000')
  })

  it('uses date_seconds when date is absent', () => {
    const raw = { date_seconds: 1700000000, alias: 'User', message: 'Hi' }
    const msg = transformMessage(raw, 'case-001')
    expect(msg.createdAt).toBe('2023-11-14T22:13:20.000Z')
  })

  it('does not throw when fields are null/undefined', () => {
    expect(() => transformMessage({}, 'case-001')).not.toThrow()
  })
})

describe('SnapEngage transformContact', () => {
  it('maps a minimal requester to canonical Contact', () => {
    const raw = { email: 'user@example.com', name: 'Jane Doe', phone: '+1-555-1234' }
    const contact = transformContact(raw)
    expect(contact.id).toBe('user@example.com')
    expect(contact.email).toBe('user@example.com')
    expect(contact.name).toBe('Jane Doe')
    expect(contact.phone).toBe('+1-555-1234')
    expect(contact.platform).toBe('snapengage')
  })

  it('uses email as the stable externalId', () => {
    const raw = { email: 'test@test.com' }
    const contact = transformContact(raw)
    expect(contact.externalId).toBe('test@test.com')
  })

  it('does not throw when fields are missing', () => {
    expect(() => transformContact({})).not.toThrow()
  })
})

describe('SnapEngage transformUser', () => {
  it('maps a minimal agent to canonical User', () => {
    const raw = { email: 'agent@company.com', name: 'Bob Agent', accountType: 'admin' }
    const user = transformUser(raw)
    expect(user.id).toBe('agent@company.com')
    expect(user.email).toBe('agent@company.com')
    expect(user.name).toBe('Bob Agent')
    expect(user.role).toBe('admin')
    expect(user.platform).toBe('snapengage')
    expect(user.teamIds).toEqual([])
  })

  it('does not throw when fields are missing', () => {
    expect(() => transformUser({})).not.toThrow()
  })
})

describe('SnapengageAdapter interface', () => {
  const adapter = new SnapengageAdapter()

  it('has platform=snapengage', () => {
    expect(adapter.platform).toBe('snapengage')
  })

  it('credentialFields includes apiToken and orgId', () => {
    const fields = adapter.credentialFields()
    const names = fields.map((f) => f.name)
    expect(names).toContain('apiToken')
    expect(names).toContain('orgId')
  })

  it('getAuthUrl throws for OAuth flow', () => {
    expect(() => adapter.getAuthUrl('state')).toThrow()
  })

  it('exchangeCode throws', async () => {
    await expect(adapter.exchangeCode('code', 'http://localhost')).rejects.toThrow()
  })

  it('refreshCredentials returns the same credentials', async () => {
    const creds = { accessToken: 'tok', extra: { orgId: 'org1' } }
    const refreshed = await adapter.refreshCredentials(creds)
    expect(refreshed).toEqual(creds)
  })
})
