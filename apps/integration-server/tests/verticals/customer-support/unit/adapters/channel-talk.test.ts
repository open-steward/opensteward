import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/channel-talk/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/channel-talk/transform/message'
import { verifyChannelTalkWebhook, parseChannelTalkWebhookEvents } from '../../../../../src/verticals/customer-support/adapters/channel-talk/webhook'

// ── ticket transform ──────────────────────────────────────────────────────────

describe('transformTicket', () => {
  const base = {
    id: 'uc_1',
    state: 'opened',
    userId: 'u_1',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_001_000,
  }

  it('maps opened → open', () => {
    const t = transformTicket(base)
    expect(t.status).toBe('open')
    expect(t.platform).toBe('channel-talk')
  })

  it('maps snoozed → pending', () => {
    const t = transformTicket({ ...base, state: 'snoozed' })
    expect(t.status).toBe('pending')
  })

  it('maps closed → closed', () => {
    const t = transformTicket({ ...base, state: 'closed', closedAt: 1_700_000_002_000 })
    expect(t.status).toBe('closed')
    expect(t.closedAt).toBe('2023-11-14T22:13:22.000Z')
  })

  it('createdAt is ISO-8601 from epoch ms', () => {
    const t = transformTicket(base)
    expect(t.createdAt).toBe(new Date(1_700_000_000_000).toISOString())
  })

  it('falls back to epoch-0 when createdAt is missing', () => {
    const t = transformTicket({ id: 'uc_2' })
    expect(t.createdAt).toBe(new Date(0).toISOString())
  })

  it('uses name as subject when present', () => {
    const t = transformTicket({ ...base, name: 'My chat' })
    expect(t.subject).toBe('My chat')
  })

  it('synthesises subject from id when name is absent', () => {
    const t = transformTicket(base)
    expect(t.subject).toBe('Chat uc_1')
  })

  it('maps source.type=widget → chat channel', () => {
    const t = transformTicket({ ...base, source: { type: 'widget' } })
    expect(t.channel).toBe('chat')
  })

  it('propagates assigneeId and teamId', () => {
    const t = transformTicket({ ...base, assigneeId: 'mgr_1', teamId: 'tm_1' })
    expect(t.assigneeId).toBe('mgr_1')
    expect(t.teamId).toBe('tm_1')
  })

  it('sets resolvedAt for closed tickets', () => {
    const t = transformTicket({ ...base, state: 'closed', closedAt: 1_700_000_002_000 })
    expect(t.resolvedAt).toBeDefined()
  })

  it('does not set resolvedAt for open tickets', () => {
    const t = transformTicket(base)
    expect(t.resolvedAt).toBeUndefined()
  })

  it('exposes raw and metadata', () => {
    const t = transformTicket({ ...base, channelId: 'ch_1', state: 'opened' })
    expect(t.raw).toBeDefined()
    expect(t.metadata['state']).toBe('opened')
  })
})

// ── message transform ─────────────────────────────────────────────────────────

describe('transformMessage', () => {
  const base = {
    id: 'msg_1',
    personType: 'user',
    personId: 'u_1',
    plainText: 'Hello',
    createdAt: 1_700_000_000_000,
  }

  it('maps personType=user → authorType=contact, type=public', () => {
    const m = transformMessage(base, 'uc_1')
    expect(m.authorType).toBe('contact')
    expect(m.type).toBe('public')
    expect(m.platform).toBe('channel-talk')
  })

  it('maps personType=manager → authorType=user, type=internal', () => {
    const m = transformMessage({ ...base, personType: 'manager' }, 'uc_1')
    expect(m.authorType).toBe('user')
    expect(m.type).toBe('internal')
  })

  it('maps personType=bot → authorType=system, type=public', () => {
    const m = transformMessage({ ...base, personType: 'bot' }, 'uc_1')
    expect(m.authorType).toBe('system')
    expect(m.type).toBe('public')
  })

  it('createdAt is ISO-8601 from epoch ms', () => {
    const m = transformMessage(base, 'uc_1')
    expect(m.createdAt).toBe(new Date(1_700_000_000_000).toISOString())
  })

  it('falls back to epoch-0 when createdAt is missing', () => {
    const m = transformMessage({ id: 'msg_2' }, 'uc_1')
    expect(m.createdAt).toBe(new Date(0).toISOString())
  })

  it('counts files as attachmentCount', () => {
    const m = transformMessage({ ...base, files: [{}, {}] }, 'uc_1')
    expect(m.attachmentCount).toBe(2)
  })

  it('ticketId is propagated', () => {
    const m = transformMessage(base, 'uc_42')
    expect(m.ticketId).toBe('uc_42')
  })
})

// ── webhook ───────────────────────────────────────────────────────────────────

describe('Channel Talk webhook', () => {
  it('verifyWebhook always returns true (no signing scheme)', () => {
    expect(verifyChannelTalkWebhook(Buffer.from('{}'), {}, 'any')).toBe(true)
  })

  it('parseEvents returns array with platform=channel-talk', () => {
    const out = parseChannelTalkWebhookEvents({
      event: 'push',
      type: 'Message',
      entity: { id: 'msg_1', chatId: 'uc_1' },
    })
    expect(Array.isArray(out)).toBe(true)
    expect(out[0]!.platform).toBe('channel-talk')
    expect(out[0]!.resourceType).toBe('messages')
    expect(out[0]!.action).toBe('created')
  })

  it('maps UserChat:update → tickets/updated', () => {
    const out = parseChannelTalkWebhookEvents({
      event: 'update',
      type: 'UserChat',
      entity: { id: 'uc_1' },
    })
    expect(out[0]!.resourceType).toBe('tickets')
    expect(out[0]!.action).toBe('updated')
  })

  it('maps User:upsert → contacts/updated', () => {
    const out = parseChannelTalkWebhookEvents({
      event: 'upsert',
      type: 'User',
      entity: { id: 'usr_1' },
    })
    expect(out[0]!.resourceType).toBe('contacts')
    expect(out[0]!.action).toBe('updated')
  })

  it('unknown event type maps to unknown resourceType', () => {
    const out = parseChannelTalkWebhookEvents({
      event: 'noop',
      type: 'Something',
      entity: { id: 'x' },
    })
    expect(out[0]!.resourceType).toBe('unknown')
  })
})
