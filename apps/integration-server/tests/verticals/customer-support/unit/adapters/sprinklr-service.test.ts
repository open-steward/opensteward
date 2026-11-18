import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifySprinklrWebhook,
  parseSprinklrWebhookEvents,
} from '../../../../../src/verticals/customer-support/adapters/sprinklr-service/webhook'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/sprinklr-service/transform/user'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/sprinklr-service/transform/team'
import { transformMacro } from '../../../../../src/verticals/customer-support/adapters/sprinklr-service/transform/macro'

// ── transformUser ───────────────────────────────────────────────────────────

describe('transformUser', () => {
  it('maps an agent with queues', () => {
    const out = transformUser({
      id: 'u-1',
      name: 'Bob Agent',
      email: 'bob@company.com',
      role: 'AGENT',
      queues: ['q-1', 'q-2'],
    })
    expect(out.id).toBe('u-1')
    expect(out.name).toBe('Bob Agent')
    expect(out.email).toBe('bob@company.com')
    expect(out.role).toBe('AGENT')
    expect(out.teamIds).toEqual(['q-1', 'q-2'])
    expect(out.platform).toBe('sprinklr-service')
  })

  it('does not throw on empty input', () => {
    expect(() => transformUser({})).not.toThrow()
  })
})

// ── transformTeam ────────────────────────────────────────────────────────────

describe('transformTeam', () => {
  it('maps a queue to a team', () => {
    const out = transformTeam({
      id: 'q-10',
      name: 'Tier 1 Support',
      description: 'First line support',
    })
    expect(out.id).toBe('q-10')
    expect(out.name).toBe('Tier 1 Support')
    expect(out.platform).toBe('sprinklr-service')
  })

  it('does not throw on empty input', () => {
    expect(() => transformTeam({})).not.toThrow()
  })
})

// ── transformMacro ───────────────────────────────────────────────────────────

describe('transformMacro', () => {
  it('maps a macro with messageTemplate', () => {
    const out = transformMacro({
      id: 'macro-1',
      name: 'Greeting',
      description: 'Standard greeting',
      messageTemplate: 'Hello, how can I help you today?',
      macroType: 'RESPONSE',
    })
    expect(out.id).toBe('macro-1')
    expect(out.title).toBe('Greeting')
    expect(out.body).toBe('Hello, how can I help you today?')
    expect(out.category).toBe('RESPONSE')
    expect(out.platform).toBe('sprinklr-service')
  })

  it('does not throw on empty input', () => {
    expect(() => transformMacro({})).not.toThrow()
  })
})

// ── verifySprinklrWebhook ────────────────────────────────────────────────────

describe('verifySprinklrWebhook', () => {
  const secret = 'test-pre-shared-key'
  const body = Buffer.from(JSON.stringify({ eventType: 'CASE_CREATED', entityId: '123' }))

  it('verifies x-hub-signature-256 (lowercase, preferred)', () => {
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifySprinklrWebhook(body, { 'x-hub-signature-256': sig }, secret)).toBe(true)
  })

  it('verifies x-hub-signature (lowercase fallback)', () => {
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifySprinklrWebhook(body, { 'x-hub-signature': sig }, secret)).toBe(true)
  })

  it('rejects wrong signature', () => {
    expect(verifySprinklrWebhook(body, { 'x-hub-signature-256': 'wrong' }, secret)).toBe(false)
  })

  it('rejects missing header', () => {
    expect(verifySprinklrWebhook(body, {}, secret)).toBe(false)
  })

  it('does not accept title-case X-Hub-Signature (headers must be lowercase)', () => {
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    // HTTP headers are canonically lowercase — title-case should NOT match
    expect(verifySprinklrWebhook(body, { 'X-Hub-Signature': sig }, secret)).toBe(false)
  })
})

// ── parseSprinklrWebhookEvents ───────────────────────────────────────────────

describe('parseSprinklrWebhookEvents', () => {
  it('maps CASE_CREATED to tickets/created', () => {
    const events = parseSprinklrWebhookEvents({ eventType: 'CASE_CREATED', entityId: 'case-1' })
    expect(events).toHaveLength(1)
    const ev = events[0]!
    expect(ev.platform).toBe('sprinklr-service')
    expect(ev.resourceType).toBe('tickets')
    expect(ev.action).toBe('created')
    expect(ev.resourceId).toBe('case-1')
  })

  it('maps CASE_CLOSED to tickets/closed', () => {
    const events = parseSprinklrWebhookEvents({ eventType: 'CASE_CLOSED', entityId: 'case-2' })
    expect(events[0]!.action).toBe('closed')
  })

  it('maps MESSAGE_RECEIVED to messages/created with caseId as ticketId', () => {
    const events = parseSprinklrWebhookEvents({
      eventType: 'MESSAGE_RECEIVED',
      entityId: 'msg-1',
      caseId: 'case-5',
    })
    expect(events[0]!.resourceType).toBe('messages')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.ticketId).toBe('case-5')
  })

  it('maps PROFILE_UPDATED to contacts/updated', () => {
    const events = parseSprinklrWebhookEvents({ eventType: 'PROFILE_UPDATED', entityId: 'prof-1' })
    expect(events[0]!.resourceType).toBe('contacts')
    expect(events[0]!.action).toBe('updated')
  })

  it('handles unknown event type gracefully', () => {
    const events = parseSprinklrWebhookEvents({ eventType: 'UNKNOWN_EVENT', entityId: 'x' })
    expect(events).toHaveLength(1)
    expect(events[0]!.resourceType).toBe('unknown')
  })
})
