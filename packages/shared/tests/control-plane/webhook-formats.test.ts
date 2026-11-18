import { describe, it, expect } from 'vitest'
import {
  renderPayload,
  WEBHOOK_FORMATS,
  TEST_EVENT_TYPE,
} from '../../src/control-plane/webhook-formats'
import type { EventEnvelope } from '../../src/control-plane/event-emitter'

function envelope<T>(type: string, data: T): EventEnvelope<T> {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    version: 1,
    type: type as EventEnvelope<T>['type'],
    created_at: 1_776_000_000_000,
    data,
  }
}

const EXPIRED = envelope('connection.authorization_expired', {
  connection_id: 'c-1',
  vertical: 'accounting',
  platform: 'fortnox',
  tenant_id: 'default',
  owner_tenant_id: null,
  label: 'Test 1',
  failed_at: 1_776_000_000_000,
})

describe('renderPayload', () => {
  describe('opensteward', () => {
    it('is byte-identical to the envelope JSON', () => {
      // The default format must not change by a single byte: existing
      // receivers verify an HMAC over exactly these bytes.
      expect(renderPayload('opensteward', EXPIRED)).toBe(JSON.stringify(EXPIRED))
    })
  })

  describe('slack', () => {
    it('always carries a text fallback alongside blocks', () => {
      const body = JSON.parse(renderPayload('slack', EXPIRED))
      expect(typeof body.text).toBe('string')
      expect(body.text.length).toBeGreaterThan(0)
      expect(Array.isArray(body.blocks)).toBe(true)
    })

    it('names the platform, the label and what the operator must do', () => {
      const body = JSON.parse(renderPayload('slack', EXPIRED))
      const flat = JSON.stringify(body)
      expect(flat).toContain('Test 1')
      expect(flat).toMatch(/fortnox/i)
      expect(flat).toMatch(/re-authoriz/i)
    })

    it('resolves a platform slug to its display name when a resolver is given', () => {
      const body = renderPayload('slack', EXPIRED, {
        resolvePlatformName: (slug) => (slug === 'fortnox' ? 'Fortnox' : undefined),
      })
      expect(body).toContain('Fortnox')
    })

    it('falls back to the slug when no resolver is given', () => {
      expect(renderPayload('slack', EXPIRED)).toContain('fortnox')
    })

    it('keeps every section text within Slack block limits', () => {
      const huge = envelope('platform.event', {
        vertical: 'payments',
        platform: 'stripe',
        connection_id: 'c-2',
        event_type: 'charge.succeeded',
        resource_type: 'charges',
        action: 'succeeded',
        resource_id: 'ch_1',
        payload: { blob: 'x'.repeat(10_000) },
        received_at: 1_776_000_000_000,
      })
      const body = JSON.parse(renderPayload('slack', huge))
      for (const block of body.blocks) {
        if (block.text) expect(block.text.text.length).toBeLessThanOrEqual(3000)
        for (const f of block.fields ?? []) expect(f.text.length).toBeLessThanOrEqual(2000)
        if (block.fields) expect(block.fields.length).toBeLessThanOrEqual(10)
      }
    })
  })

  describe('teams', () => {
    it('is an Adaptive Card attachment, not a legacy MessageCard', () => {
      const body = JSON.parse(renderPayload('teams', EXPIRED))
      expect(body.type).toBe('message')
      expect(body.attachments).toHaveLength(1)
      expect(body.attachments[0].contentType).toBe('application/vnd.microsoft.card.adaptive')
      expect(body.attachments[0].content.type).toBe('AdaptiveCard')
      expect(body.attachments[0].content.version).toBe('1.5')
      // The retired Office 365 connector shape must not appear.
      expect(JSON.stringify(body)).not.toContain('MessageCard')
    })

    it('carries the detail as card facts', () => {
      const body = JSON.parse(renderPayload('teams', EXPIRED))
      const flat = JSON.stringify(body.attachments[0].content)
      expect(flat).toContain('Test 1')
      expect(flat).toContain('FactSet')
    })
  })

  describe('flat', () => {
    it('flattens nested data to dotted keys with primitive values', () => {
      const body = JSON.parse(renderPayload('flat', EXPIRED))
      expect(body.event).toBe('connection.authorization_expired')
      expect(body.event_id).toBe('11111111-2222-3333-4444-555555555555')
      expect(body['data.connection_id']).toBe('c-1')
      expect(body['data.label']).toBe('Test 1')
      for (const value of Object.values(body)) {
        expect(['string', 'number', 'boolean', 'object']).toContain(typeof value)
        if (typeof value === 'object') expect(value).toBeNull()
      }
    })

    it('summarises an array by length rather than inlining it', () => {
      const batched = envelope('resource.synced', {
        vertical: 'accounting',
        platform: 'fortnox',
        connection_id: 'c-1',
        resource_type: 'invoices',
        fetched_at: 1_776_000_000_000,
        op: 'upsert',
        items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      })
      const body = JSON.parse(renderPayload('flat', batched))
      expect(body['data.items.count']).toBe(3)
      expect(body['data.items']).toBeUndefined()
    })

    it('caps depth rather than recursing without bound', () => {
      const deep = envelope('platform.event', {
        payload: { a: { b: { c: { d: { e: 'buried' } } } } },
      })
      const body = JSON.parse(renderPayload('flat', deep))
      const values = Object.values(body).map((v) => String(v))
      expect(values.some((v) => v.includes('buried'))).toBe(true)
      expect(Object.keys(body).every((k) => k.split('.').length <= 5)).toBe(true)
    })
  })

  describe('every format', () => {
    // The seven untyped events and any future one must not throw. A renderer
    // that crashes takes the delivery down with it.
    const AWKWARD: Array<[string, unknown]> = [
      ['customer.deleted', { id: 'e-1' }],
      ['customer.created', { id: 'e-1', email: 'a@b.test', displayName: 'Ada' }],
      ['connect_link.created', { id: 's-1', token: 'tok', url: 'https://x.test/c/tok' }],
      ['connect_link.consumed', { id: 's-1', connection: { id: 'c-1', platform: 'fortnox' } }],
      ['resource.updated', { vertical: 'crm', platform: 'nutshell', resource_type: 'contacts' }],
      ['something.invented', { nothing: 'recognised' }],
      ['customer.updated', null],
      ['customer.updated', undefined],
      ['platform.event', { payload: { self: null } }],
    ]

    it.each(WEBHOOK_FORMATS)('%s renders every event shape without throwing', (format) => {
      for (const [type, data] of AWKWARD) {
        const out = renderPayload(format, envelope(type, data))
        expect(typeof out).toBe('string')
        expect(() => JSON.parse(out)).not.toThrow()
      }
    })

    it.each(WEBHOOK_FORMATS)('%s renders both resource.synced shapes', (format) => {
      const perItem = envelope('resource.synced', {
        vertical: 'accounting',
        platform: 'fortnox',
        connection_id: 'c-1',
        resource_type: 'invoices',
        resource_id: 'inv-1',
        data: { total: 42 },
        fetched_at: 1_776_000_000_000,
        op: 'upsert',
      })
      const batched = envelope('resource.synced', {
        vertical: 'accounting',
        platform: 'fortnox',
        connection_id: 'c-1',
        resource_type: 'invoices',
        fetched_at: 1_776_000_000_000,
        op: 'upsert',
        items: [{ id: 'inv-1' }, { id: 'inv-2' }],
      })
      expect(() => JSON.parse(renderPayload(format, perItem))).not.toThrow()
      expect(() => JSON.parse(renderPayload(format, batched))).not.toThrow()
    })

    it('rejects an unknown format rather than silently sending the default', () => {
      // A format string that reached the renderer without matching means the
      // store and the validator disagree — fail loudly, do not guess.
      expect(() => renderPayload('carrier-pigeon' as never, EXPIRED)).toThrow(/format/i)
    })
  })

  describe('the synthetic test event', () => {
    const TEST = envelope(TEST_EVENT_TYPE, {
      subscription_id: 'whs_1',
      sent_at: 1_776_000_000_000,
    })

    it.each(WEBHOOK_FORMATS)('%s says plainly that this is a test', (format) => {
      const out = renderPayload(format, TEST)
      expect(() => JSON.parse(out)).not.toThrow()
      // An operator seeing this land in a channel must not mistake it for a
      // real incident — "connection needs re-authorization" would be alarming.
      expect(out.toLowerCase()).toContain('test')
    })

    it('renders as Slack blocks, not the envelope', () => {
      const body = JSON.parse(renderPayload('slack', TEST))
      expect(body.text).toMatch(/test/i)
      expect(body.blocks).toBeInstanceOf(Array)
    })

    it('keeps the envelope shape for the default format', () => {
      expect(renderPayload('opensteward', TEST)).toBe(JSON.stringify(TEST))
    })
  })
})
