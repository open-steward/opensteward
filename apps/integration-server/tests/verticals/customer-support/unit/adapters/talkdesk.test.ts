import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, createSign } from 'node:crypto'
import { buildTokenUrl, buildAuthorizeUrl, API_BASE_URL_BY_REGION, OAUTH_DOMAIN_BY_REGION } from '../../../../../src/verticals/customer-support/adapters/talkdesk/constants'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/talkdesk/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/talkdesk/transform/message'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/talkdesk/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/talkdesk/transform/user'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/talkdesk/transform/team'
import { verifyTalkdeskWebhook, parseTalkdeskWebhookEvents } from '../../../../../src/verticals/customer-support/adapters/talkdesk/webhook'

// ── Region-aware token URL construction ──────────────────────────────────────

describe('buildTokenUrl', () => {
  it('builds the US token URL with the account name', () => {
    const url = buildTokenUrl('myaccount', 'us')
    expect(url).toBe('https://myaccount.talkdeskid.com/oauth/token')
  })

  it('builds the EU token URL with the account name', () => {
    const url = buildTokenUrl('myaccount', 'eu')
    expect(url).toBe('https://myaccount.talkdeskid.eu/oauth/token')
  })

  it('builds the CA token URL with the account name', () => {
    const url = buildTokenUrl('myaccount', 'ca')
    expect(url).toBe('https://myaccount.talkdeskidca.com/oauth/token')
  })

  it('falls back to US domain for unknown region', () => {
    const url = buildTokenUrl('myaccount', 'unknown-region')
    expect(url).toContain('myaccount.')
    expect(url).toContain('/oauth/token')
    expect(url).toContain('talkdeskid.com')
  })

  it('defaults to US when no region is provided', () => {
    const url = buildTokenUrl('myaccount')
    expect(url).toBe('https://myaccount.talkdeskid.com/oauth/token')
  })
})

describe('buildAuthorizeUrl', () => {
  it('builds the US authorize URL', () => {
    const url = buildAuthorizeUrl('myaccount', 'us')
    expect(url).toBe('https://myaccount.talkdeskid.com/oauth/authorize')
  })

  it('builds the EU authorize URL', () => {
    const url = buildAuthorizeUrl('myaccount', 'eu')
    expect(url).toBe('https://myaccount.talkdeskid.eu/oauth/authorize')
  })
})

describe('API_BASE_URL_BY_REGION', () => {
  it('has correct US base URL', () => {
    expect(API_BASE_URL_BY_REGION['us']).toBe('https://api.talkdeskapp.com')
  })

  it('has correct EU base URL', () => {
    expect(API_BASE_URL_BY_REGION['eu']).toBe('https://api.talkdeskapp.eu')
  })

  it('has correct CA base URL', () => {
    expect(API_BASE_URL_BY_REGION['ca']).toBe('https://api.talkdeskappca.com')
  })
})

describe('OAUTH_DOMAIN_BY_REGION', () => {
  it('is distinct from the API base URL domain (separate identity service)', () => {
    // Token URL must NOT use api.talkdeskapp.com
    expect(OAUTH_DOMAIN_BY_REGION['us']).not.toContain('api.talkdeskapp')
    expect(OAUTH_DOMAIN_BY_REGION['us']).toContain('talkdeskid')
  })
})

// ── transformTicket ───────────────────────────────────────────────────────────

describe('transformTicket — id, status, priority mapping', () => {
  const base = {
    id: 'case-uuid-123',
    subject: 'Login issue',
    status: 'open',
    priority: 'high',
    channel: 'email',
    contact_id: 'cnt-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  }

  it('maps id correctly', () => {
    const tkt = transformTicket(base)
    expect(tkt.id).toBe('case-uuid-123')
    expect(tkt.externalId).toBe('case-uuid-123')
  })

  it('maps open status', () => {
    const tkt = transformTicket({ ...base, status: 'open' })
    expect(tkt.status).toBe('open')
    expect(tkt.platform).toBe('talkdesk')
  })

  it('maps new status to open', () => {
    const tkt = transformTicket({ ...base, status: 'new' })
    expect(tkt.status).toBe('open')
  })

  it('maps pending status', () => {
    const tkt = transformTicket({ ...base, status: 'pending' })
    expect(tkt.status).toBe('pending')
  })

  it('maps on_hold status', () => {
    const tkt = transformTicket({ ...base, status: 'on_hold' })
    expect(tkt.status).toBe('on_hold')
  })

  it('maps resolved status', () => {
    const tkt = transformTicket({ ...base, status: 'resolved' })
    expect(tkt.status).toBe('resolved')
  })

  it('maps closed status', () => {
    const tkt = transformTicket({ ...base, status: 'closed' })
    expect(tkt.status).toBe('closed')
  })

  it('maps high priority', () => {
    const tkt = transformTicket({ ...base, priority: 'high' })
    expect(tkt.priority).toBe('high')
  })

  it('maps low priority', () => {
    const tkt = transformTicket({ ...base, priority: 'low' })
    expect(tkt.priority).toBe('low')
  })

  it('maps normal priority', () => {
    const tkt = transformTicket({ ...base, priority: 'normal' })
    expect(tkt.priority).toBe('normal')
  })

  it('maps urgent priority', () => {
    const tkt = transformTicket({ ...base, priority: 'urgent' })
    expect(tkt.priority).toBe('urgent')
  })

  it('omits priority for unknown value', () => {
    const tkt = transformTicket({ ...base, priority: 'whatever' })
    expect(tkt.priority).toBeUndefined()
  })

  it('sets resolvedAt when status is resolved and resolved_at is given', () => {
    const tkt = transformTicket({
      ...base,
      status: 'resolved',
      resolved_at: '2026-01-03T12:00:00Z',
    })
    expect(tkt.resolvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('createdAt is ISO-8601', () => {
    const tkt = transformTicket(base)
    expect(tkt.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('sets metadata.rawChannel from channel field', () => {
    const tkt = transformTicket({ ...base, channel: 'phone' })
    expect(tkt.metadata['rawChannel']).toBe('phone')
  })
})

// ── transformTicket never throws on minimal input ────────────────────────────

describe('transformTicket — never throws on minimal input', () => {
  it('handles missing optional fields without throwing', () => {
    expect(() => transformTicket({ id: 'x' })).not.toThrow()
  })

  it('handles null optional fields without throwing', () => {
    expect(() =>
      transformTicket({
        id: 'y',
        subject: null,
        status: null,
        priority: null,
        channel: null,
        contact_id: null,
        assignee_id: null,
        team_id: null,
        description: null,
        tags: null,
        created_at: null,
        updated_at: null,
        resolved_at: null,
      })
    ).not.toThrow()
  })

  it('returns a valid platform string even with minimal input', () => {
    const tkt = transformTicket({ id: 'min-case' })
    expect(tkt.platform).toBe('talkdesk')
    expect(typeof tkt.id).toBe('string')
  })
})

// ── transformMessage never throws on minimal input ───────────────────────────

describe('transformMessage — never throws on minimal input', () => {
  it('handles missing optional fields', () => {
    expect(() => transformMessage({ id: 'n1' }, 'tkt1')).not.toThrow()
  })

  it('maps note_body to body', () => {
    const msg = transformMessage({ id: 'n2', note_body: 'Hello', author_id: 'a1', public: true, created_at: '2026-01-01T00:00:00Z' }, 'tkt-abc')
    expect(msg.body).toBe('Hello')
    expect(msg.authorId).toBe('a1')
    expect(msg.ticketId).toBe('tkt-abc')
    expect(msg.type).toBe('public')
    expect(msg.platform).toBe('talkdesk')
  })

  it('maps private note (public=false) to internal type', () => {
    const msg = transformMessage({ id: 'n3', public: false }, 'tkt1')
    expect(msg.type).toBe('internal')
  })
})

// ── transformContact never throws on minimal input ───────────────────────────

describe('transformContact — never throws on minimal input', () => {
  it('handles no emails or phones', () => {
    expect(() => transformContact({ id: 'c1' })).not.toThrow()
  })

  it('picks primary email preferring work type', () => {
    const contact = transformContact({
      id: 'c2',
      name: 'Jane Doe',
      emails: [
        { email: 'personal@example.com', type: 'personal' },
        { email: 'work@example.com', type: 'work' },
      ],
    })
    expect(contact.email).toBe('work@example.com')
    expect(contact.platform).toBe('talkdesk')
  })
})

// ── transformUser never throws on minimal input ───────────────────────────────

describe('transformUser — never throws on minimal input', () => {
  it('handles missing optional fields', () => {
    expect(() => transformUser({ id: 'u1' })).not.toThrow()
  })

  it('maps team ids correctly', () => {
    const user = transformUser({
      id: 'u2',
      name: 'Alice',
      email: 'alice@example.com',
      teams: [{ id: 't1' }, { id: 't2' }],
    })
    expect(user.teamIds).toEqual(['t1', 't2'])
    expect(user.platform).toBe('talkdesk')
  })
})

// ── transformTeam never throws on minimal input ───────────────────────────────

describe('transformTeam — never throws on minimal input', () => {
  it('handles missing optional fields', () => {
    expect(() => transformTeam({})).not.toThrow()
  })

  it('prefers teamId over id field', () => {
    const team = transformTeam({ teamId: 'tid-1', id: 'id-1', name: 'Support' })
    expect(team.id).toBe('tid-1')
    expect(team.platform).toBe('talkdesk')
  })

  it('falls back to id when teamId is missing', () => {
    const team = transformTeam({ id: 'id-2', name: 'Engineering' })
    expect(team.id).toBe('id-2')
  })
})

// ── Webhook verification (ECDSA + SHA512) ────────────────────────────────────

describe('verifyTalkdeskWebhook', () => {
  it('returns false for missing signature header', () => {
    expect(verifyTalkdeskWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('returns false for empty secret', () => {
    expect(verifyTalkdeskWebhook(Buffer.from('{}'), { 'x-hub-ecdsa-signature': 'aabbcc' }, '')).toBe(false)
  })

  it('returns false for invalid/garbage signature', () => {
    // Valid key, garbage signature
    const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-521' })
    const derKey = publicKey.export({ type: 'spki', format: 'der' }) as Buffer
    const secret = derKey.toString('base64')
    expect(
      verifyTalkdeskWebhook(Buffer.from('{}'), { 'x-hub-ecdsa-signature': 'deadbeef' }, secret)
    ).toBe(false)
  })

  it('verifies a real ECDSA-SHA512 signature', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-521' })

    const payload = Buffer.from('{"event":"case.created","id":"abc"}')

    // Sign with private key using SHA512
    const signer = createSign('SHA512')
    signer.update(payload)
    const sigHex = signer.sign(privateKey).toString('hex')

    // Export public key as DER SPKI, then base64 (this is what Talkdesk provides)
    const derKey = publicKey.export({ type: 'spki', format: 'der' }) as Buffer
    const secret = derKey.toString('base64')

    expect(
      verifyTalkdeskWebhook(payload, { 'x-hub-ecdsa-signature': sigHex }, secret)
    ).toBe(true)
  })

  it('rejects a signature for different payload', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-521' })

    const originalPayload = Buffer.from('{"event":"case.created"}')
    const tamperedPayload = Buffer.from('{"event":"case.deleted"}')

    const signer = createSign('SHA512')
    signer.update(originalPayload)
    const sigHex = signer.sign(privateKey).toString('hex')

    const derKey = publicKey.export({ type: 'spki', format: 'der' }) as Buffer
    const secret = derKey.toString('base64')

    expect(
      verifyTalkdeskWebhook(tamperedPayload, { 'x-hub-ecdsa-signature': sigHex }, secret)
    ).toBe(false)
  })

  it('does case-insensitive header lookup', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-521' })

    const payload = Buffer.from('hello')
    const signer = createSign('SHA512')
    signer.update(payload)
    const sigHex = signer.sign(privateKey).toString('hex')

    const derKey = publicKey.export({ type: 'spki', format: 'der' }) as Buffer
    const secret = derKey.toString('base64')

    // Pass header with uppercase key
    expect(
      verifyTalkdeskWebhook(payload, { 'X-Hub-Ecdsa-Signature': sigHex }, secret)
    ).toBe(true)
  })
})

// ── parseTalkdeskWebhookEvents ────────────────────────────────────────────────

describe('parseTalkdeskWebhookEvents', () => {
  it('returns an array', () => {
    const events = parseTalkdeskWebhookEvents({ event_type: 'case.created', data: { id: 'c1' } })
    expect(Array.isArray(events)).toBe(true)
  })

  it('maps case.created to tickets/created', () => {
    const events = parseTalkdeskWebhookEvents({ event_type: 'case.created', data: { id: 'c1' } })
    expect(events[0]!.platform).toBe('talkdesk')
    expect(events[0]!.resourceType).toBe('tickets')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('c1')
  })

  it('maps note.created to messages/commented', () => {
    const events = parseTalkdeskWebhookEvents({
      event_type: 'note.created',
      data: { id: 'n1', case_id: 'c1' },
    })
    expect(events[0]!.resourceType).toBe('messages')
    expect(events[0]!.action).toBe('commented')
    expect(events[0]!.ticketId).toBe('c1')
  })

  it('maps contact.updated to contacts/updated', () => {
    const events = parseTalkdeskWebhookEvents({ event_type: 'contact.updated', data: { id: 'ct1' } })
    expect(events[0]!.resourceType).toBe('contacts')
    expect(events[0]!.action).toBe('updated')
  })

  it('handles unknown event types gracefully without throwing', () => {
    expect(() => parseTalkdeskWebhookEvents({ event_type: 'unknown.event', data: {} })).not.toThrow()
    const events = parseTalkdeskWebhookEvents({ event_type: 'unknown.event', data: {} })
    expect(Array.isArray(events)).toBe(true)
    expect(events[0]!.resourceType).toBe('unknown')
  })

  it('does not throw on empty payload', () => {
    expect(() => parseTalkdeskWebhookEvents({})).not.toThrow()
  })
})
