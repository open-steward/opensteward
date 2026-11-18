import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawThenaTicket,
} from '../../../../../src/verticals/customer-support/adapters/thena/transform/ticket'
import {
  transformMessage,
  type RawThenaComment,
} from '../../../../../src/verticals/customer-support/adapters/thena/transform/message'
import {
  transformTag,
  type RawThenaTag,
} from '../../../../../src/verticals/customer-support/adapters/thena/transform/tag'
import {
  transformTeam,
  type RawThenaTeam,
} from '../../../../../src/verticals/customer-support/adapters/thena/transform/team'
import {
  verifyThenaWebhook,
  parseThenaWebhookEvents,
} from '../../../../../src/verticals/customer-support/adapters/thena/webhook'
import { ThenaAdapter } from '../../../../../src/verticals/customer-support/adapters/thena/index'

// ── Ticket transform ──────────────────────────────────────────────────────────

describe('Thena ticket transform', () => {
  it('maps status=open to status=open', () => {
    const t = transformTicket({ id: 'tkt1', status: 'open' })
    expect(t.status).toBe('open')
    expect(t.platform).toBe('thena')
  })

  it('maps status=in_progress to status=in_progress', () => {
    const t = transformTicket({ id: 'tkt2', status: 'in_progress' })
    expect(t.status).toBe('in_progress')
  })

  it('maps status=closed to status=closed', () => {
    const t = transformTicket({ id: 'tkt3', status: 'closed' })
    expect(t.status).toBe('closed')
  })

  it('maps status=resolved to status=resolved', () => {
    const t = transformTicket({ id: 'tkt4', status: 'resolved' })
    expect(t.status).toBe('resolved')
  })

  it('maps unknown status to open', () => {
    const t = transformTicket({ id: 'tkt5', status: 'whatever' })
    expect(t.status).toBe('open')
  })

  it('maps priority=high to high', () => {
    const t = transformTicket({ id: 'tkt6', priority: 'high' })
    expect(t.priority).toBe('high')
  })

  it('maps priority=urgent to urgent', () => {
    const t = transformTicket({ id: 'tkt7', priority: 'urgent' })
    expect(t.priority).toBe('urgent')
  })

  it('maps source=slack to channel=chat', () => {
    const t = transformTicket({ id: 'tkt8', source: 'slack' })
    expect(t.channel).toBe('chat')
  })

  it('maps source=email to channel=email', () => {
    const t = transformTicket({ id: 'tkt9', source: 'email' })
    expect(t.channel).toBe('email')
  })

  it('uses ticketId as number field', () => {
    const t = transformTicket({ id: 'tkt10', ticketId: 42 })
    expect(t.number).toBe('42')
  })

  it('sets requesterId from customerContactId', () => {
    const t = transformTicket({ id: 'tkt11', customerContactId: 'contact-99' })
    expect(t.requesterId).toBe('contact-99')
  })

  it('falls back to requestorEmail for requesterId', () => {
    const t = transformTicket({ id: 'tkt12', requestorEmail: 'user@example.com' })
    expect(t.requesterId).toBe('user@example.com')
  })

  it('createdAt defaults to epoch when missing', () => {
    const t = transformTicket({ id: 'tkt13' })
    expect(t.createdAt).toBe(new Date(0).toISOString())
  })

  it('parses ISO 8601 createdAt', () => {
    const t = transformTicket({ id: 'tkt14', createdAt: '2024-01-15T10:00:00.000Z' })
    expect(t.createdAt).toBe('2024-01-15T10:00:00.000Z')
  })

  it('does not throw on empty input', () => {
    expect(() => transformTicket({} as RawThenaTicket)).not.toThrow()
  })

  it('sets metadata.isEscalated when isEscalated=true', () => {
    const t = transformTicket({ id: 'tkt15', isEscalated: true })
    expect(t.metadata['isEscalated']).toBe('true')
  })

  it('carries raw field', () => {
    const raw: RawThenaTicket = { id: 'tkt16', title: 'Raw test' }
    const t = transformTicket(raw)
    expect(t.raw).toBe(raw)
  })
})

// ── Message transform ─────────────────────────────────────────────────────────

describe('Thena message transform', () => {
  it('maps commentVisibility=internal to type=internal', () => {
    const m = transformMessage({ id: 'm1', commentVisibility: 'internal' }, 'tkt1')
    expect(m.type).toBe('internal')
  })

  it('maps commentVisibility=public to type=public', () => {
    const m = transformMessage({ id: 'm2', commentVisibility: 'public' }, 'tkt1')
    expect(m.type).toBe('public')
  })

  it('maps authorUserType=customer to authorType=contact', () => {
    const m = transformMessage({ id: 'm3', authorUserType: 'customer' }, 'tkt1')
    expect(m.authorType).toBe('contact')
  })

  it('maps customerContactId present to authorType=contact', () => {
    const m = transformMessage({ id: 'm4', customerContactId: 'cid-1' }, 'tkt1')
    expect(m.authorType).toBe('contact')
  })

  it('maps authorUserType=bot to authorType=system', () => {
    const m = transformMessage({ id: 'm5', authorUserType: 'bot' }, 'tkt1')
    expect(m.authorType).toBe('system')
  })

  it('prefers contentMarkdown over content for body', () => {
    const m = transformMessage({ id: 'm6', content: 'plain', contentMarkdown: '**bold**' }, 'tkt1')
    expect(m.body).toBe('**bold**')
  })

  it('falls back to content when contentMarkdown is absent', () => {
    const m = transformMessage({ id: 'm7', content: 'plain text' }, 'tkt1')
    expect(m.body).toBe('plain text')
  })

  it('sets ticketId from second argument', () => {
    const m = transformMessage({ id: 'm8' }, 'ticket-42')
    expect(m.ticketId).toBe('ticket-42')
  })

  it('counts attachments', () => {
    const m = transformMessage({ id: 'm9', attachments: ['a', 'b', 'c'] }, 'tkt1')
    expect(m.attachmentCount).toBe(3)
  })

  it('createdAt defaults to epoch when missing', () => {
    const m = transformMessage({ id: 'm10' }, 'tkt1')
    expect(m.createdAt).toBe(new Date(0).toISOString())
  })

  it('does not throw on minimal input', () => {
    expect(() => transformMessage({ id: 'm11' } as RawThenaComment, 'tkt1')).not.toThrow()
  })

  it('sets platform=thena', () => {
    const m = transformMessage({ id: 'm12' }, 'tkt1')
    expect(m.platform).toBe('thena')
  })
})

// ── Tag transform ─────────────────────────────────────────────────────────────

describe('Thena tag transform', () => {
  it('maps id and name', () => {
    const tag = transformTag({ id: 'tag-1', name: 'billing' })
    expect(tag.id).toBe('tag-1')
    expect(tag.name).toBe('billing')
    expect(tag.platform).toBe('thena')
  })

  it('sets metadata.color', () => {
    const tag = transformTag({ id: 'tag-2', name: 'urgent', color: '#ff0000' })
    expect(tag.metadata['color']).toBe('#ff0000')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformTag({ id: 'tag-3' } as RawThenaTag)).not.toThrow()
  })
})

// ── Team transform ────────────────────────────────────────────────────────────

describe('Thena team transform', () => {
  it('maps id and name', () => {
    const t = transformTeam({ id: 'team-1', name: 'Support' })
    expect(t.id).toBe('team-1')
    expect(t.name).toBe('Support')
    expect(t.platform).toBe('thena')
  })

  it('uses identifier as externalId when present', () => {
    const t = transformTeam({ id: 'team-2', identifier: 'SUPP', name: 'Support' })
    expect(t.externalId).toBe('SUPP')
  })

  it('falls back to id as externalId when identifier absent', () => {
    const t = transformTeam({ id: 'team-3', name: 'Ops' })
    expect(t.externalId).toBe('team-3')
  })

  it('sets metadata fields', () => {
    const t = transformTeam({
      id: 'team-4',
      name: 'T',
      isActive: true,
      isPrivate: false,
    } as RawThenaTeam)
    expect(t.metadata['isActive']).toBe('true')
    expect(t.metadata['isPrivate']).toBe('false')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformTeam({} as RawThenaTeam)).not.toThrow()
  })
})

// ── Webhook ───────────────────────────────────────────────────────────────────

describe('Thena webhook verification', () => {
  it('always returns true (no signing scheme published)', () => {
    expect(verifyThenaWebhook(Buffer.from('payload'), {}, 'secret')).toBe(true)
  })
})

describe('Thena parseWebhookEvents', () => {
  it('maps ticket:created event to tickets/created', () => {
    const events = parseThenaWebhookEvents({
      eventId: 'evt-1',
      eventType: 'ticket:created',
      payload: { id: 'tkt-42' },
    })
    expect(events).toHaveLength(1)
    expect(events[0]!.resourceType).toBe('tickets')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('tkt-42')
    expect(events[0]!.platform).toBe('thena')
  })

  it('maps ticket:assigned to tickets/assigned', () => {
    const events = parseThenaWebhookEvents({
      eventId: 'evt-2',
      eventType: 'ticket:assigned',
      payload: { id: 'tkt-10' },
    })
    expect(events[0]!.action).toBe('assigned')
  })

  it('maps ticket:comment:added to messages/commented and sets ticketId', () => {
    const events = parseThenaWebhookEvents({
      eventId: 'evt-3',
      eventType: 'ticket:comment:added',
      payload: { id: 'comment-5', ticketId: 'tkt-20' },
      metadata: {},
    })
    expect(events[0]!.resourceType).toBe('messages')
    expect(events[0]!.action).toBe('commented')
    expect(events[0]!.ticketId).toBe('tkt-20')
  })

  it('maps unknown eventType to unknown/unknown without throwing', () => {
    expect(() =>
      parseThenaWebhookEvents({ eventId: 'evt-x', eventType: 'some:new:event' }),
    ).not.toThrow()
    const events = parseThenaWebhookEvents({ eventId: 'evt-x', eventType: 'some:new:event' })
    expect(events[0]!.resourceType).toBe('unknown')
    expect(events[0]!.action).toBe('unknown')
  })

  it('does not throw when payload is empty object', () => {
    expect(() => parseThenaWebhookEvents({})).not.toThrow()
  })

  it('carries original payload in event', () => {
    const raw = { eventId: 'e1', eventType: 'ticket:updated', payload: { id: 'tkt-1' } }
    const events = parseThenaWebhookEvents(raw)
    expect(events[0]!.payload).toBe(raw)
  })
})

// ── Adapter sanity ────────────────────────────────────────────────────────────

describe('ThenaAdapter', () => {
  it('has platform=thena', () => {
    const adapter = new ThenaAdapter()
    expect(adapter.platform).toBe('thena')
  })

  it('credentialFields returns apiKey field', () => {
    const adapter = new ThenaAdapter()
    const fields = adapter.credentialFields()
    expect(fields.some((f) => f.name === 'apiKey')).toBe(true)
  })

  it('getAuthUrl throws (no OAuth flow)', () => {
    const adapter = new ThenaAdapter()
    expect(() => adapter.getAuthUrl('state')).toThrow()
  })

  it('exchangeCode throws (no OAuth flow)', async () => {
    const adapter = new ThenaAdapter()
    await expect(adapter.exchangeCode('code', 'https://redirect')).rejects.toThrow()
  })

  it('refreshCredentials returns credentials unchanged', async () => {
    const adapter = new ThenaAdapter()
    const creds = { accessToken: 'key-abc', extra: {} }
    const result = await adapter.refreshCredentials(creds)
    expect(result).toBe(creds)
  })
})
