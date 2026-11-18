import { describe, it, expect } from 'vitest'
import { UserlikeAdapter } from '../../../../../src/verticals/customer-support/adapters/userlike'
import { transformTicket, type RawUserlikeConversation } from '../../../../../src/verticals/customer-support/adapters/userlike/transform/ticket'
import { transformMessage, type RawUserlikeMessage } from '../../../../../src/verticals/customer-support/adapters/userlike/transform/message'
import { transformContact, type RawUserlikeContact } from '../../../../../src/verticals/customer-support/adapters/userlike/transform/contact'
import { transformUser, type RawUserlikeOperator } from '../../../../../src/verticals/customer-support/adapters/userlike/transform/user'

// ── Adapter construction ──────────────────────────────────────────────────────

describe('UserlikeAdapter construction', () => {
  it('platform is userlike', () => {
    const adapter = new UserlikeAdapter()
    expect(adapter.platform).toBe('userlike')
  })

  it('getAuthUrl throws (static token auth)', () => {
    const adapter = new UserlikeAdapter()
    expect(() => adapter.getAuthUrl('state')).toThrow()
  })

  it('exchangeCode throws (static token auth)', async () => {
    const adapter = new UserlikeAdapter()
    await expect(adapter.exchangeCode('code', 'https://cb')).rejects.toThrow()
  })

  it('credentialFields includes apiKey', () => {
    const adapter = new UserlikeAdapter()
    const fields = adapter.credentialFields()
    expect(fields.some((f) => f.name === 'apiKey')).toBe(true)
  })

  it('exchangeCredentials produces accessToken from apiKey', async () => {
    const adapter = new UserlikeAdapter()
    const creds = await adapter.exchangeCredentials({ apiKey: 'tok_test' })
    expect(creds.accessToken).toBe('tok_test')
  })

  it('exchangeCredentials throws on missing apiKey', async () => {
    const adapter = new UserlikeAdapter()
    await expect(adapter.exchangeCredentials({})).rejects.toThrow()
  })

  it('refreshCredentials returns credentials unchanged', async () => {
    const adapter = new UserlikeAdapter()
    const creds = { accessToken: 'abc', extra: {} }
    const refreshed = await adapter.refreshCredentials(creds)
    expect(refreshed).toBe(creds)
  })
})

// ── transformTicket ───────────────────────────────────────────────────────────

describe('transformTicket', () => {
  const rawConversation: RawUserlikeConversation = {
    id: 42,
    status: 'active',
    operator_assigned_to: 7,
    contact: { id: 55, name: 'Jane Doe', email: 'jane@example.com' },
    contact_channel: { type: 'website', state: 'online' },
    last_message: { id: 'msg-1', body: 'Hello, I need help', sent_at: '2026-01-15T09:00:00Z' },
    topics: [{ id: 1, name: 'billing' }, { id: 2, name: 'urgent' }],
    um_widget: { id: 10, name: 'Main Widget' },
    rate: 4,
    feedback_message: 'Great support!',
    created_at: '2026-01-15T09:00:00Z',
    updated_at: '2026-01-20T12:00:00Z',
  }

  it('maps id and platform', () => {
    const t = transformTicket(rawConversation)
    expect(t.id).toBe('42')
    expect(t.platform).toBe('userlike')
  })

  it('maps active status to open', () => {
    expect(transformTicket(rawConversation).status).toBe('open')
  })

  it('maps pending status', () => {
    const t = transformTicket({ ...rawConversation, status: 'pending' })
    expect(t.status).toBe('pending')
  })

  it('maps ended status to closed', () => {
    const t = transformTicket({ ...rawConversation, status: 'ended' })
    expect(t.status).toBe('closed')
  })

  it('defaults unknown status to open', () => {
    const t = transformTicket({ ...rawConversation, status: 'unknown_status' })
    expect(t.status).toBe('open')
  })

  it('maps website channel type to chat', () => {
    expect(transformTicket(rawConversation).channel).toBe('chat')
  })

  it('maps email channel type', () => {
    const t = transformTicket({ ...rawConversation, contact_channel: { type: 'email' } })
    expect(t.channel).toBe('email')
  })

  it('maps whatsapp channel type to social', () => {
    const t = transformTicket({ ...rawConversation, contact_channel: { type: 'whatsapp' } })
    expect(t.channel).toBe('social')
  })

  it('maps sms channel type', () => {
    const t = transformTicket({ ...rawConversation, contact_channel: { type: 'sms' } })
    expect(t.channel).toBe('sms')
  })

  it('maps requesterId from contact', () => {
    expect(transformTicket(rawConversation).requesterId).toBe('55')
  })

  it('maps assigneeId from operator_assigned_to', () => {
    expect(transformTicket(rawConversation).assigneeId).toBe('7')
  })

  it('maps topic ids to tagIds', () => {
    expect(transformTicket(rawConversation).tagIds).toEqual(['1', '2'])
  })

  it('maps satisfaction rating', () => {
    expect(transformTicket(rawConversation).satisfactionRating).toBe(4)
  })

  it('maps dates to ISO-8601', () => {
    const t = transformTicket(rawConversation)
    expect(t.createdAt).toBe('2026-01-15T09:00:00.000Z')
    expect(t.updatedAt).toBe('2026-01-20T12:00:00.000Z')
  })

  it('sets resolvedAt for closed tickets', () => {
    const t = transformTicket({ ...rawConversation, status: 'ended' })
    expect(t.resolvedAt).toBe('2026-01-20T12:00:00.000Z')
  })

  it('does not set resolvedAt for open tickets', () => {
    expect(transformTicket(rawConversation).resolvedAt).toBeUndefined()
  })

  it('includes widget info in metadata', () => {
    const t = transformTicket(rawConversation)
    expect(t.metadata['widget_name']).toBe('Main Widget')
    expect(t.metadata['widget_id']).toBe('10')
  })

  it('includes channel_type in metadata', () => {
    expect(transformTicket(rawConversation).metadata['channel_type']).toBe('website')
  })

  it('attaches raw', () => {
    expect(transformTicket(rawConversation).raw).toBe(rawConversation)
  })

  it('handles missing optional fields', () => {
    const t = transformTicket({ id: 1 })
    expect(t.id).toBe('1')
    expect(t.requesterId).toBe('')
    expect(t.assigneeId).toBeUndefined()
    expect(t.tagIds).toEqual([])
    expect(t.satisfactionRating).toBeUndefined()
  })

  it('falls back createdAt to epoch on missing date', () => {
    const t = transformTicket({ id: 1 })
    expect(t.createdAt).toBe(new Date(0).toISOString())
  })
})

// ── transformMessage ──────────────────────────────────────────────────────────

describe('transformMessage', () => {
  const rawMessage: RawUserlikeMessage = {
    id: 'msg-100',
    conversation_id: 42,
    body: 'Hello from the visitor',
    sent_at: '2026-01-15T09:05:00Z',
    type: 'message',
    sender: { type: 'contact', id: 55 },
    operator_id: null,
    operator_name: null,
    marked_read_operator: false,
    marked_read_contact: true,
  }

  it('maps id and platform', () => {
    const m = transformMessage(rawMessage, '42')
    expect(m.id).toBe('msg-100')
    expect(m.platform).toBe('userlike')
  })

  it('maps ticketId', () => {
    expect(transformMessage(rawMessage, '42').ticketId).toBe('42')
  })

  it('maps contact sender type to user', () => {
    expect(transformMessage(rawMessage, '42').authorType).toBe('user')
  })

  it('maps operator sender type to agent', () => {
    const m = transformMessage({ ...rawMessage, sender: { type: 'operator', id: 7 } }, '42')
    expect(m.authorType).toBe('agent')
  })

  it('maps bot sender type to bot', () => {
    const m = transformMessage({ ...rawMessage, sender: { type: 'bot', id: 1 } }, '42')
    expect(m.authorType).toBe('bot')
  })

  it('uses sender.id as authorId', () => {
    expect(transformMessage(rawMessage, '42').authorId).toBe('55')
  })

  it('falls back to operator_id for authorId', () => {
    const m = transformMessage({ ...rawMessage, sender: undefined, operator_id: 9 }, '42')
    expect(m.authorId).toBe('9')
  })

  it('maps body', () => {
    expect(transformMessage(rawMessage, '42').body).toBe('Hello from the visitor')
  })

  it('maps sent_at to ISO-8601', () => {
    expect(transformMessage(rawMessage, '42').createdAt).toBe('2026-01-15T09:05:00.000Z')
  })

  it('attaches raw', () => {
    expect(transformMessage(rawMessage, '42').raw).toBe(rawMessage)
  })

  it('handles missing optional fields', () => {
    const m = transformMessage({}, '42')
    expect(m.id).toBe('')
    expect(m.body).toBe('')
    expect(m.authorId).toBe('')
    expect(m.createdAt).toBe(new Date(0).toISOString())
  })
})

// ── transformContact ──────────────────────────────────────────────────────────

describe('transformContact', () => {
  const rawContact: RawUserlikeContact = {
    id: 55,
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone_number: '+1-555-0100',
    mobile_number: '+1-555-0101',
    city: 'Berlin',
    country: 'DE',
    locale: 'de-DE',
    verified: true,
    external_customer_id: 'ext-9999',
    conversation_count: 3,
  }

  it('maps id and platform', () => {
    const c = transformContact(rawContact)
    expect(c.id).toBe('55')
    expect(c.platform).toBe('userlike')
  })

  it('uses external_customer_id as externalId when present', () => {
    expect(transformContact(rawContact).externalId).toBe('ext-9999')
  })

  it('falls back to id as externalId when no external_customer_id', () => {
    const c = transformContact({ id: 55, name: 'Test' })
    expect(c.externalId).toBe('55')
  })

  it('maps email', () => {
    expect(transformContact(rawContact).email).toBe('jane@example.com')
  })

  it('maps name', () => {
    expect(transformContact(rawContact).name).toBe('Jane Doe')
  })

  it('maps phone_number as phone', () => {
    expect(transformContact(rawContact).phone).toBe('+1-555-0100')
  })

  it('falls back to mobile_number if no phone_number', () => {
    const c = transformContact({ ...rawContact, phone_number: null })
    expect(c.phone).toBe('+1-555-0101')
  })

  it('keeps city/country in metadata only (schema-firewall)', () => {
    const c = transformContact(rawContact)
    expect(c.metadata['city']).toBe('Berlin')
    expect(c.metadata['country']).toBe('DE')
    expect('city' in c).toBe(false)
  })

  it('includes verified and conversation_count in metadata', () => {
    const c = transformContact(rawContact)
    expect(c.metadata['verified']).toBe('true')
    expect(c.metadata['conversation_count']).toBe('3')
  })

  it('attaches raw', () => {
    expect(transformContact(rawContact).raw).toBe(rawContact)
  })

  it('handles minimal contact object', () => {
    const c = transformContact({ id: 1 })
    expect(c.name).toBe('')
    expect(c.email).toBeUndefined()
    expect(c.phone).toBeUndefined()
  })
})

// ── transformUser ─────────────────────────────────────────────────────────────

describe('transformUser', () => {
  const rawOperator: RawUserlikeOperator = {
    id: 7,
    name: 'alice_smith',
    display_name: 'Alice Smith',
    email: 'alice@company.com',
    first_name: 'Alice',
    last_name: 'Smith',
    role: 'a',
    enabled: true,
    is_active: true,
    um_away: false,
    operator_group: { id: 10, name: 'Tier1' },
    timezone: 'Europe/Berlin',
    locale: 'de-DE',
  }

  it('maps id and platform', () => {
    const u = transformUser(rawOperator)
    expect(u.id).toBe('7')
    expect(u.platform).toBe('userlike')
  })

  it('uses display_name as name', () => {
    expect(transformUser(rawOperator).name).toBe('Alice Smith')
  })

  it('falls back to name when display_name absent', () => {
    const u = transformUser({ ...rawOperator, display_name: null })
    expect(u.name).toBe('alice_smith')
  })

  it('maps email', () => {
    expect(transformUser(rawOperator).email).toBe('alice@company.com')
  })

  it('maps role "a" to agent', () => {
    expect(transformUser(rawOperator).role).toBe('agent')
  })

  it('maps role "m" to manager', () => {
    const u = transformUser({ ...rawOperator, role: 'm' })
    expect(u.role).toBe('manager')
  })

  it('maps role "s" to staff', () => {
    const u = transformUser({ ...rawOperator, role: 's' })
    expect(u.role).toBe('staff')
  })

  it('maps operator_group id to teamIds', () => {
    expect(transformUser(rawOperator).teamIds).toEqual(['10'])
  })

  it('has empty teamIds when no operator_group', () => {
    const u = transformUser({ ...rawOperator, operator_group: null })
    expect(u.teamIds).toEqual([])
  })

  it('includes first_name and last_name in metadata', () => {
    const u = transformUser(rawOperator)
    expect(u.metadata['first_name']).toBe('Alice')
    expect(u.metadata['last_name']).toBe('Smith')
  })

  it('includes timezone and locale in metadata', () => {
    const u = transformUser(rawOperator)
    expect(u.metadata['timezone']).toBe('Europe/Berlin')
    expect(u.metadata['locale']).toBe('de-DE')
  })

  it('attaches raw', () => {
    expect(transformUser(rawOperator).raw).toBe(rawOperator)
  })

  it('handles minimal operator object', () => {
    const u = transformUser({ id: 1 })
    expect(u.name).toBe('')
    expect(u.email).toBeUndefined()
    expect(u.teamIds).toEqual([])
  })
})
