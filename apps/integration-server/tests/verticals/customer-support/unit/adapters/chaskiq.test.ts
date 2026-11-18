import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawChaskiqConversation,
} from '../../../../../src/verticals/customer-support/adapters/chaskiq/transform/ticket'
import {
  transformMessage,
  type RawChaskiqConversationPart,
} from '../../../../../src/verticals/customer-support/adapters/chaskiq/transform/message'
import {
  transformContact,
  type RawChaskiqAppUser,
} from '../../../../../src/verticals/customer-support/adapters/chaskiq/transform/contact'
import {
  transformUser,
  type RawChaskiqAgent,
} from '../../../../../src/verticals/customer-support/adapters/chaskiq/transform/user'
import {
  transformTeam,
  type RawChaskiqTeam,
} from '../../../../../src/verticals/customer-support/adapters/chaskiq/transform/team'
import { ChaskiqAdapter } from '../../../../../src/verticals/customer-support/adapters/chaskiq/index'

// ── transformTicket ──────────────────────────────────────────────────────────

describe('transformTicket', () => {
  it('maps an open conversation to a Ticket with platform=chaskiq', () => {
    const raw: RawChaskiqConversation = {
      id: 'conv-1',
      key: 'k1',
      subject: 'Help with billing',
      state: 'open',
      priority: false,
      created_at: '2026-01-01T10:00:00Z',
      conversation_channels: ['email'],
      assignee: { id: 'agent-42' },
      main_participant: { id: 'user-99' },
    }
    const ticket = transformTicket(raw)
    expect(ticket.id).toBe('conv-1')
    expect(ticket.externalId).toBe('conv-1')
    expect(ticket.platform).toBe('chaskiq')
    expect(ticket.status).toBe('open')
    expect(ticket.priority).toBeUndefined()
    expect(ticket.channel).toBe('email')
    expect(ticket.assigneeId).toBe('agent-42')
    expect(ticket.requesterId).toBe('user-99')
    expect(ticket.subject).toBe('Help with billing')
    expect(ticket.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(ticket.metadata['channels']).toBe('email')
  })

  it('maps a resolved conversation with closed_at', () => {
    const raw: RawChaskiqConversation = {
      id: 'conv-2',
      state: 'resolved',
      closed_at: '2026-01-02T12:00:00Z',
      created_at: '2026-01-01T10:00:00Z',
    }
    const ticket = transformTicket(raw)
    expect(ticket.status).toBe('resolved')
    expect(ticket.resolvedAt).toBeDefined()
    expect(ticket.closedAt).toBeDefined()
  })

  it('maps priority=true to high', () => {
    const raw: RawChaskiqConversation = {
      id: 'conv-3',
      state: 'open',
      priority: true,
      created_at: '2026-01-01T10:00:00Z',
    }
    const ticket = transformTicket(raw)
    expect(ticket.priority).toBe('high')
  })

  it('maps chat channel to chat', () => {
    const raw: RawChaskiqConversation = {
      id: 'conv-4',
      state: 'open',
      conversation_channels: ['chat'],
      created_at: '2026-01-01T10:00:00Z',
    }
    const ticket = transformTicket(raw)
    expect(ticket.channel).toBe('chat')
  })

  it('maps messenger channel to chat', () => {
    const raw: RawChaskiqConversation = {
      id: 'conv-5',
      state: 'open',
      conversation_channels: ['messenger'],
      created_at: '2026-01-01T10:00:00Z',
    }
    const ticket = transformTicket(raw)
    expect(ticket.channel).toBe('chat')
  })

  it('defaults to web channel when conversation_channels is absent', () => {
    const raw: RawChaskiqConversation = {
      id: 'conv-6',
      state: 'open',
      created_at: '2026-01-01T10:00:00Z',
    }
    const ticket = transformTicket(raw)
    expect(ticket.channel).toBe('web')
  })

  it('handles missing optional fields without throwing', () => {
    const raw: RawChaskiqConversation = { id: 'conv-7' }
    const ticket = transformTicket(raw)
    expect(ticket.id).toBe('conv-7')
    expect(ticket.status).toBe('open')
    expect(ticket.subject).toBe('')
    expect(ticket.createdAt).toBeDefined()
  })

  it('falls back to key when id is absent', () => {
    const raw: RawChaskiqConversation = { key: 'k99' }
    const ticket = transformTicket(raw)
    expect(ticket.id).toBe('k99')
  })

  it('includes tag_list in tagIds', () => {
    const raw: RawChaskiqConversation = {
      id: 'conv-8',
      tag_list: ['billing', 'vip'],
    }
    const ticket = transformTicket(raw)
    expect(ticket.tagIds).toEqual(['billing', 'vip'])
  })
})

// ── transformMessage (AuthorType) ─────────────────────────────────────────────

describe('transformMessage — AuthorType mapping', () => {
  it('maps from_bot=true to authorType=system', () => {
    const raw: RawChaskiqConversationPart = {
      id: 'part-1',
      from_bot: true,
      app_user: { id: 'bot-id', kind: 'app_user' },
      message: { text_content: 'Automated reply' },
      created_at: '2026-01-01T10:00:00Z',
    }
    const msg = transformMessage(raw, 'conv-1')
    expect(msg.authorType).toBe('system')
    expect(msg.platform).toBe('chaskiq')
    expect(msg.ticketId).toBe('conv-1')
  })

  it('maps app_user.kind===agent to authorType=user', () => {
    const raw: RawChaskiqConversationPart = {
      id: 'part-2',
      from_bot: false,
      app_user: { id: 'agent-1', kind: 'agent' },
      message: { text_content: 'Agent reply' },
      created_at: '2026-01-01T10:01:00Z',
    }
    const msg = transformMessage(raw, 'conv-1')
    expect(msg.authorType).toBe('user')
    expect(msg.authorId).toBe('agent-1')
  })

  it('maps app_user.kind===app_user to authorType=contact', () => {
    const raw: RawChaskiqConversationPart = {
      id: 'part-3',
      from_bot: false,
      app_user: { id: 'contact-1', kind: 'app_user' },
      message: { text_content: 'Customer message' },
      created_at: '2026-01-01T10:02:00Z',
    }
    const msg = transformMessage(raw, 'conv-1')
    expect(msg.authorType).toBe('contact')
  })

  it('maps app_user.kind===visitor to authorType=contact (default)', () => {
    const raw: RawChaskiqConversationPart = {
      id: 'part-4',
      from_bot: false,
      app_user: { id: 'visitor-1', kind: 'visitor' },
      message: { text_content: 'Visitor message' },
      created_at: '2026-01-01T10:03:00Z',
    }
    const msg = transformMessage(raw, 'conv-1')
    expect(msg.authorType).toBe('contact')
  })

  it('maps null app_user to authorType=contact (default)', () => {
    const raw: RawChaskiqConversationPart = {
      id: 'part-5',
      from_bot: false,
      app_user: null,
      message: { text_content: 'Unknown sender' },
      created_at: '2026-01-01T10:04:00Z',
    }
    const msg = transformMessage(raw, 'conv-1')
    expect(msg.authorType).toBe('contact')
  })

  it('private_note=true → type=internal', () => {
    const raw: RawChaskiqConversationPart = {
      id: 'part-6',
      private_note: true,
      app_user: { id: 'agent-2', kind: 'agent' },
      message: { text_content: 'Internal note' },
      created_at: '2026-01-01T10:05:00Z',
    }
    const msg = transformMessage(raw, 'conv-1')
    expect(msg.type).toBe('internal')
  })

  it('private_note=false → type=public', () => {
    const raw: RawChaskiqConversationPart = {
      id: 'part-7',
      private_note: false,
      app_user: { id: 'user-3', kind: 'app_user' },
      message: { text_content: 'Public reply' },
      created_at: '2026-01-01T10:06:00Z',
    }
    const msg = transformMessage(raw, 'conv-1')
    expect(msg.type).toBe('public')
  })

  it('falls back to html_content when text_content absent', () => {
    const raw: RawChaskiqConversationPart = {
      id: 'part-8',
      message: { html_content: '<p>HTML body</p>' },
      created_at: '2026-01-01T10:07:00Z',
    }
    const msg = transformMessage(raw, 'conv-1')
    expect(msg.body).toBe('<p>HTML body</p>')
  })

  it('falls back to epoch ISO when created_at is absent', () => {
    const raw: RawChaskiqConversationPart = { id: 'part-9' }
    const msg = transformMessage(raw, 'conv-1')
    expect(msg.createdAt).toBe(new Date(0).toISOString())
    expect(msg.body).toBe('')
  })

  it('uses key as id fallback when id is absent', () => {
    const raw: RawChaskiqConversationPart = { key: 'k-abc' }
    const msg = transformMessage(raw, 'conv-1')
    expect(msg.id).toBe('k-abc')
  })

  it('metadata includes fromBot flag', () => {
    const raw: RawChaskiqConversationPart = {
      id: 'part-10',
      from_bot: true,
      message: { text_content: 'Bot msg' },
      created_at: '2026-01-01T10:08:00Z',
    }
    const msg = transformMessage(raw, 'conv-1')
    expect(msg.metadata['fromBot']).toBe('true')
  })
})

// ── transformContact ─────────────────────────────────────────────────────────

describe('transformContact', () => {
  it('maps a full AppUser to a Contact with platform=chaskiq', () => {
    const raw: RawChaskiqAppUser = {
      id: 'user-1',
      email: 'alice@example.com',
      name: 'Alice',
      phone: '+1-555-0100',
      kind: 'app_user',
      tag_list: ['vip', 'trial'],
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('user-1')
    expect(contact.externalId).toBe('user-1')
    expect(contact.platform).toBe('chaskiq')
    expect(contact.email).toBe('alice@example.com')
    expect(contact.name).toBe('Alice')
    expect(contact.phone).toBe('+1-555-0100')
    expect(contact.metadata['kind']).toBe('app_user')
    expect(contact.metadata['tags']).toBe('vip,trial')
  })

  it('prefers display_name over name', () => {
    const raw: RawChaskiqAppUser = {
      id: 'user-2',
      name: 'raw name',
      display_name: 'Display Name',
    }
    const contact = transformContact(raw)
    expect(contact.name).toBe('Display Name')
  })

  it('prefers full_name over name when display_name absent', () => {
    const raw: RawChaskiqAppUser = {
      id: 'user-3',
      name: 'raw name',
      full_name: 'Full Name',
    }
    const contact = transformContact(raw)
    expect(contact.name).toBe('Full Name')
  })

  it('handles missing optional fields without throwing', () => {
    const raw: RawChaskiqAppUser = { id: 'user-4' }
    const contact = transformContact(raw)
    expect(contact.id).toBe('user-4')
    expect(contact.email).toBeUndefined()
    expect(contact.name).toBe('')
    expect(contact.phone).toBeUndefined()
  })
})

// ── transformUser ────────────────────────────────────────────────────────────

describe('transformUser', () => {
  it('maps a full Agent to a User with platform=chaskiq', () => {
    const raw: RawChaskiqAgent = {
      id: 'agent-1',
      email: 'bob@example.com',
      name: 'Bob',
      available: true,
      lang: 'en',
      area_of_expertise: 'billing',
      availability: 'online',
    }
    const user = transformUser(raw)
    expect(user.id).toBe('agent-1')
    expect(user.externalId).toBe('agent-1')
    expect(user.platform).toBe('chaskiq')
    expect(user.email).toBe('bob@example.com')
    expect(user.name).toBe('Bob')
    expect(user.role).toBe('billing')
    expect(user.teamIds).toEqual([])
    expect(user.metadata['available']).toBe('true')
    expect(user.metadata['lang']).toBe('en')
  })

  it('falls back to availability when area_of_expertise absent', () => {
    const raw: RawChaskiqAgent = {
      id: 'agent-2',
      availability: 'online',
    }
    const user = transformUser(raw)
    expect(user.role).toBe('online')
  })

  it('handles missing optional fields without throwing', () => {
    const raw: RawChaskiqAgent = { id: 'agent-3' }
    const user = transformUser(raw)
    expect(user.id).toBe('agent-3')
    expect(user.email).toBeUndefined()
    expect(user.name).toBe('')
    expect(user.role).toBeUndefined()
  })
})

// ── transformTeam ─────────────────────────────────────────────────────────────

describe('transformTeam', () => {
  it('maps a Team with platform=chaskiq', () => {
    const raw: RawChaskiqTeam = { id: 'team-1', name: 'Billing Team' }
    const team = transformTeam(raw)
    expect(team.id).toBe('team-1')
    expect(team.externalId).toBe('team-1')
    expect(team.platform).toBe('chaskiq')
    expect(team.name).toBe('Billing Team')
  })

  it('handles missing optional fields without throwing', () => {
    const raw: RawChaskiqTeam = {}
    const team = transformTeam(raw)
    expect(team.id).toBe('')
    expect(team.name).toBe('')
  })
})

// ── ChaskiqAdapter constructor ────────────────────────────────────────────────

describe('ChaskiqAdapter', () => {
  const adapter = new ChaskiqAdapter()

  it('has platform=chaskiq', () => {
    expect(adapter.platform).toBe('chaskiq')
  })

  it('credentialFields returns accessToken + appKey + instanceUrl', () => {
    const fields = adapter.credentialFields()
    const names = fields.map((f) => f.name)
    expect(names).toContain('accessToken')
    expect(names).toContain('appKey')
    expect(names).toContain('instanceUrl')
  })

  it('exchangeCredentials returns Credentials with accessToken and appKey in extra', async () => {
    const creds = await adapter.exchangeCredentials({
      accessToken: 'tok-abc',
      appKey: 'appkey-123',
    })
    expect(creds.accessToken).toBe('tok-abc')
    expect((creds.extra as Record<string, string>)['appKey']).toBe('appkey-123')
  })

  it('exchangeCredentials includes instanceUrl in extra when provided', async () => {
    const creds = await adapter.exchangeCredentials({
      accessToken: 'tok-xyz',
      appKey: 'appkey-456',
      instanceUrl: 'https://chat.example.com',
    })
    expect((creds.extra as Record<string, string>)['instanceUrl']).toBe('https://chat.example.com')
  })

  it('exchangeCredentials throws when accessToken is absent', async () => {
    await expect(adapter.exchangeCredentials({ appKey: 'k' })).rejects.toThrow()
  })

  it('exchangeCredentials throws when appKey is absent', async () => {
    await expect(adapter.exchangeCredentials({ accessToken: 'tok' })).rejects.toThrow()
  })

  it('getAuthUrl throws (no OAuth redirect flow)', () => {
    expect(() => adapter.getAuthUrl('state')).toThrow()
  })

  it('exchangeCode throws (no OAuth redirect flow)', async () => {
    await expect(adapter.exchangeCode('code', 'https://example.com')).rejects.toThrow()
  })

  it('refreshCredentials returns the same credentials', async () => {
    const creds = { accessToken: 'tok', extra: { appKey: 'k' } }
    const result = await adapter.refreshCredentials(creds)
    expect(result).toBe(creds)
  })

  it('getMessage throws with helpful message', async () => {
    await expect(
      adapter.getMessage({ accessToken: 'tok', extra: { appKey: 'k' } }, 'msg-1'),
    ).rejects.toThrow(/listMessages/)
  })

  it('getUser throws with helpful message', async () => {
    await expect(
      adapter.getUser({ accessToken: 'tok', extra: { appKey: 'k' } }, 'u-1'),
    ).rejects.toThrow(/listUsers/)
  })
})
