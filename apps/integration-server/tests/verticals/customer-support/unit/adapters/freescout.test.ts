import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyFreescoutWebhook,
  parseFreescoutWebhookEvents,
  EVENT_HEADER,
} from '../../../../../src/verticals/customer-support/adapters/freescout/webhook'

describe('FreeScout webhook', () => {
  describe('verifyFreescoutWebhook', () => {
    it('verifies HMAC-SHA1 over raw body, base64-encoded', () => {
      const secret = 'test-secret'
      const body = Buffer.from('{"event":"convo.created"}')
      const sig = createHmac('sha1', secret).update(body).digest('base64')
      expect(
        verifyFreescoutWebhook(body, { 'x-freescout-signature': sig }, secret),
      ).toBe(true)
    })

    it('accepts canonical header casing (X-FreeScout-Signature)', () => {
      const secret = 'test-secret'
      const body = Buffer.from('{}')
      const sig = createHmac('sha1', secret).update(body).digest('base64')
      expect(
        verifyFreescoutWebhook(body, { 'X-FreeScout-Signature': sig }, secret),
      ).toBe(true)
    })

    it('rejects wrong secret', () => {
      const body = Buffer.from('{}')
      const sig = createHmac('sha1', 'correct').update(body).digest('base64')
      expect(
        verifyFreescoutWebhook(body, { 'x-freescout-signature': sig }, 'wrong'),
      ).toBe(false)
    })

    it('rejects missing signature header', () => {
      expect(verifyFreescoutWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
    })

    it('rejects tampered body', () => {
      const secret = 'secret'
      const sig = createHmac('sha1', secret).update(Buffer.from('original')).digest('base64')
      expect(
        verifyFreescoutWebhook(Buffer.from('tampered'), { 'x-freescout-signature': sig }, secret),
      ).toBe(false)
    })
  })

  describe('parseFreescoutWebhookEvents', () => {
    it('returns array with platform=freescout', () => {
      const out = parseFreescoutWebhookEvents({ event: 'convo.created', conversation: { id: 42 } })
      expect(Array.isArray(out)).toBe(true)
      expect(out.length).toBeGreaterThan(0)
      expect(out[0]!.platform).toBe('freescout')
    })

    it('maps convo.created to tickets/created', () => {
      const out = parseFreescoutWebhookEvents({ event: 'convo.created', conversation: { id: 1 } })
      expect(out[0]!.resourceType).toBe('tickets')
      expect(out[0]!.action).toBe('created')
    })

    it('maps convo.status to tickets/updated', () => {
      const out = parseFreescoutWebhookEvents({ event: 'convo.status', conversation: { id: 2 } })
      expect(out[0]!.resourceType).toBe('tickets')
      expect(out[0]!.action).toBe('updated')
    })

    it('maps convo.agent.reply.created to messages/commented', () => {
      const out = parseFreescoutWebhookEvents({
        event: 'convo.agent.reply.created',
        conversation: { id: 3 },
        thread: { id: 99 },
      })
      expect(out[0]!.resourceType).toBe('messages')
      expect(out[0]!.action).toBe('commented')
      expect(out[0]!.resourceId).toBe('99')
      expect(out[0]!.ticketId).toBe('3')
    })

    it('reads event type from EVENT_HEADER key in payload', () => {
      // Callers that have parsed the X-FreeScout-Event header inject it as payload[EVENT_HEADER]
      const out = parseFreescoutWebhookEvents({
        [EVENT_HEADER]: 'customer.created',
        id: 55,
      })
      expect(out[0]!.resourceType).toBe('contacts')
      expect(out[0]!.action).toBe('created')
    })

    it('reads event type from _event convention', () => {
      const out = parseFreescoutWebhookEvents({ _event: 'customer.updated', id: 7 })
      expect(out[0]!.resourceType).toBe('contacts')
      expect(out[0]!.action).toBe('updated')
    })

    it('falls back to unknown for unrecognised event types', () => {
      const out = parseFreescoutWebhookEvents({ event: 'some.unknown.event', id: 0 })
      expect(out[0]!.resourceType).toBe('unknown')
      expect(out[0]!.action).toBe('unknown')
    })

    it('never throws on non-string or missing fields', () => {
      expect(() => parseFreescoutWebhookEvents({})).not.toThrow()
      expect(() => parseFreescoutWebhookEvents({ event: null, conversation: null })).not.toThrow()
      expect(() => parseFreescoutWebhookEvents({ event: 42 })).not.toThrow()
    })
  })

  describe('EVENT_HEADER constant', () => {
    it('is x-freescout-event (lowercase)', () => {
      expect(EVENT_HEADER).toBe('x-freescout-event')
    })
  })
})
