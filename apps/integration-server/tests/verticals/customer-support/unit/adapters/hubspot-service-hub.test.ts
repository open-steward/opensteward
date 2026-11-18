import { describe, it, expect } from 'vitest'
import { createHash, createHmac } from 'node:crypto'
import {
  verifyHubspotWebhook,
  parseHubspotWebhookEvents,
} from '../../../../../src/verticals/customer-support/adapters/hubspot-service-hub/webhook'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/hubspot-service-hub/transform/ticket'
import { transformTag } from '../../../../../src/verticals/customer-support/adapters/hubspot-service-hub/transform/tag'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/hubspot-service-hub/transform/team'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/hubspot-service-hub/transform/user'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/hubspot-service-hub/transform/contact'

// ── Webhook v1 (plain SHA-256, NOT HMAC) ─────────────────────────────────────

describe('verifyHubspotWebhook v1', () => {
  it('accepts a valid v1 signature using plain SHA-256(secret + body)', () => {
    const secret = 'my-client-secret'
    const body = Buffer.from('{"test":true}')
    // v1: SHA-256(secret + body), hex-encoded — plain hash, not HMAC
    const sig = createHash('sha256')
      .update(secret + body.toString('utf8'), 'utf8')
      .digest('hex')
    expect(verifyHubspotWebhook(body, { 'x-hubspot-signature': sig }, secret)).toBe(true)
  })

  it('rejects a v1 signature computed as HMAC-SHA256 (wrong algorithm)', () => {
    const secret = 'my-client-secret'
    const body = Buffer.from('{"test":true}')
    // Intentionally use HMAC — this should NOT match
    const wrongSig = createHmac('sha256', secret)
      .update(secret + body.toString('utf8'), 'utf8')
      .digest('hex')
    expect(verifyHubspotWebhook(body, { 'x-hubspot-signature': wrongSig }, secret)).toBe(false)
  })

  it('rejects a v1 signature with the wrong secret', () => {
    const body = Buffer.from('hello')
    const sig = createHash('sha256')
      .update('good-secret' + body.toString('utf8'))
      .digest('hex')
    expect(verifyHubspotWebhook(body, { 'x-hubspot-signature': sig }, 'bad-secret')).toBe(false)
  })
})

// ── Webhook v3 (HMAC-SHA256 over method+uri+body+timestamp) ──────────────────

describe('verifyHubspotWebhook v3', () => {
  const secret = 'app-secret'
  const body = Buffer.from('{"event":"test"}')
  const requestMethod = 'POST'
  const requestUri = 'https://example.com/webhooks/customer-support/hubspot-service-hub'
  const tsHeader = String(Date.now())

  function makeV3Sig(): string {
    const signed = `${requestMethod}${requestUri}${body.toString('utf8')}${tsHeader}`
    return createHmac('sha256', secret).update(signed, 'utf8').digest('base64')
  }

  it('accepts a valid v3 signature when requestUri is provided', () => {
    const sig = makeV3Sig()
    expect(
      verifyHubspotWebhook(
        body,
        { 'x-hubspot-signature-v3': sig, 'x-hubspot-request-timestamp': tsHeader },
        secret,
        requestUri,
      ),
    ).toBe(true)
  })

  it('rejects a v3 signature when the URI does not match', () => {
    const sig = makeV3Sig()
    expect(
      verifyHubspotWebhook(
        body,
        { 'x-hubspot-signature-v3': sig, 'x-hubspot-request-timestamp': tsHeader },
        secret,
        'https://wrong.example.com/webhooks',
      ),
    ).toBe(false)
  })

  it('rejects a v3 signature outside the 5-minute replay window', () => {
    const oldTs = String(Date.now() - 10 * 60 * 1000) // 10 minutes ago
    const oldSigned = `${requestMethod}${requestUri}${body.toString('utf8')}${oldTs}`
    const oldSig = createHmac('sha256', secret).update(oldSigned, 'utf8').digest('base64')
    expect(
      verifyHubspotWebhook(
        body,
        { 'x-hubspot-signature-v3': oldSig, 'x-hubspot-request-timestamp': oldTs },
        secret,
        requestUri,
      ),
    ).toBe(false)
  })
})

// ── Webhook: missing headers ──────────────────────────────────────────────────

describe('verifyHubspotWebhook edge cases', () => {
  it('returns false when no signature headers are present', () => {
    expect(verifyHubspotWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('returns false for non-numeric timestamp in v3', () => {
    expect(
      verifyHubspotWebhook(
        Buffer.from('{}'),
        { 'x-hubspot-signature-v3': 'abc', 'x-hubspot-request-timestamp': 'not-a-number' },
        'secret',
      ),
    ).toBe(false)
  })
})

// ── parseHubspotWebhookEvents ─────────────────────────────────────────────────

describe('parseHubspotWebhookEvents', () => {
  it('parses a ticket.creation event', () => {
    const raw = [{ subscriptionType: 'ticket.creation', objectId: '42', eventId: '99' }]
    const events = parseHubspotWebhookEvents(raw as unknown as Record<string, unknown>)
    expect(Array.isArray(events)).toBe(true)
    expect(events).toHaveLength(1)
    const evt = events[0]!
    expect(evt.platform).toBe('hubspot-service-hub')
    expect(evt.resourceType).toBe('tickets')
    expect(evt.action).toBe('created')
    expect(evt.resourceId).toBe('42')
  })

  it('parses a ticket.propertyChange for hs_pipeline_stage=4 as resolved', () => {
    const raw = [
      {
        subscriptionType: 'ticket.propertyChange',
        objectId: '7',
        eventId: '1',
        propertyName: 'hs_pipeline_stage',
        propertyValue: '4',
      },
    ]
    const events = parseHubspotWebhookEvents(raw as unknown as Record<string, unknown>)
    expect(events[0]!.action).toBe('resolved')
  })

  it('returns array when given a non-array payload', () => {
    const events = parseHubspotWebhookEvents({
      subscriptionType: 'ticket.deletion',
      objectId: '5',
      eventId: '2',
    })
    expect(Array.isArray(events)).toBe(true)
    expect(events[0]!.action).toBe('deleted')
  })
})

// ── transformTicket ───────────────────────────────────────────────────────────

describe('transformTicket', () => {
  it('maps a resolved ticket correctly', () => {
    const raw = {
      id: 'ticket-1',
      properties: {
        subject: 'Login broken',
        hs_pipeline_stage: '4',
        hs_ticket_priority: 'HIGH',
        source_type: 'EMAIL',
        createdate: '2026-01-01T00:00:00.000Z',
        hs_lastmodifieddate: '2026-01-02T00:00:00.000Z',
        hs_closed_at: '2026-01-02T00:00:00.000Z',
        hs_tags: 'tag1;tag2',
      },
    }
    const ticket = transformTicket(raw)
    expect(ticket.id).toBe('ticket-1')
    expect(ticket.platform).toBe('hubspot-service-hub')
    expect(ticket.status).toBe('resolved')
    expect(ticket.priority).toBe('high')
    expect(ticket.channel).toBe('email')
    expect(ticket.tagIds).toEqual(['tag1', 'tag2'])
    expect(ticket.createdAt).toBe('2026-01-01T00:00:00.000Z')
    expect(ticket.raw).toBe(raw)
  })

  it('defaults to open status for unknown stage', () => {
    const raw = { id: 't2', properties: { subject: 'Test', hs_pipeline_stage: '999' } }
    const ticket = transformTicket(raw)
    expect(ticket.status).toBe('open')
  })

  it('handles missing properties gracefully (no throw)', () => {
    const raw = { id: 't3', properties: {} }
    expect(() => transformTicket(raw)).not.toThrow()
    const ticket = transformTicket(raw)
    expect(ticket.id).toBe('t3')
    expect(ticket.subject).toBe('')
  })
})

// ── transformTag ──────────────────────────────────────────────────────────────

describe('transformTag', () => {
  it('maps a tag option to canonical Tag', () => {
    const raw = { value: 'bug', label: 'Bug Report', displayOrder: 1, hidden: false }
    const tag = transformTag(raw)
    expect(tag.id).toBe('bug')
    expect(tag.name).toBe('Bug Report')
    expect(tag.platform).toBe('hubspot-service-hub')
  })

  it('falls back to value when label is missing', () => {
    const raw = { value: 'billing' }
    const tag = transformTag(raw)
    expect(tag.name).toBe('billing')
  })
})

// ── transformTeam ─────────────────────────────────────────────────────────────

describe('transformTeam', () => {
  it('maps a team object', () => {
    const raw = {
      id: 'team-1',
      name: 'Support Team',
      userIds: ['u1', 'u2'],
      secondaryUserIds: ['u3'],
    }
    const team = transformTeam(raw)
    expect(team.id).toBe('team-1')
    expect(team.name).toBe('Support Team')
    expect(team.platform).toBe('hubspot-service-hub')
    expect(team.metadata['primaryMemberCount']).toBe('2')
  })
})

// ── transformUser ─────────────────────────────────────────────────────────────

describe('transformUser', () => {
  it('maps an owner to canonical User', () => {
    const raw = {
      id: 'owner-1',
      email: 'agent@example.com',
      firstName: 'Alice',
      lastName: 'Smith',
      teams: [{ id: 'team-1', name: 'Support', primary: true }],
    }
    const user = transformUser(raw)
    expect(user.id).toBe('owner-1')
    expect(user.email).toBe('agent@example.com')
    expect(user.name).toBe('Alice Smith')
    expect(user.teamIds).toEqual(['team-1'])
    expect(user.platform).toBe('hubspot-service-hub')
  })
})

// ── transformContact ──────────────────────────────────────────────────────────

describe('transformContact', () => {
  it('maps a contact CRM object', () => {
    const raw = {
      id: 'contact-1',
      properties: {
        email: 'user@example.com',
        firstname: 'Bob',
        lastname: 'Jones',
        phone: '+1-555-0100',
        associatedcompanyid: 'company-99',
      },
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('contact-1')
    expect(contact.email).toBe('user@example.com')
    expect(contact.name).toBe('Bob Jones')
    expect(contact.phone).toBe('+1-555-0100')
    expect(contact.organizationId).toBe('company-99')
    expect(contact.platform).toBe('hubspot-service-hub')
  })
})

// transformMessage is pinned against HubSpot's documented message rows in
// unit/adapters/hubspot-service-hub/transform/message.test.ts.

// getTag used to synchronously reject every call ("no individual GET
// endpoint"); it now has a real implementation
// (GET /crm/object-tags/2026-09/{objectTypeId}/{tagId}). That behavior is
// now pinned in unit/adapters/hubspot-service-hub/index.test.ts, which
// asserts the exact request path and that upstream failures propagate
// rather than a canned rejection — this stale describe block asserted the
// old behavior and has been removed rather than duplicated here.
