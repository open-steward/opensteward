/**
 * FastSpring webhook verification + event parsing tests.
 *
 * Docs: https://developer.fastspring.com/reference/message-security
 * (X-FS-Signature, base64 HMAC-SHA256 over the raw body, header name is
 * "not case-sensitive") and
 * https://developer.fastspring.com/reference/webhooks-overview
 * (`{ events: [{ id, type, data, live, processed, created }] }`, and "each
 * POST from FastSpring to your endpoint may contain multiple events").
 */
import { createHmac } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import {
  verifyFastSpringWebhook,
  parseFastSpringWebhookEvents,
} from '../../../../../../src/verticals/ecommerce/adapters/fastspring/webhook'
import { WebhookEventSchema } from '../../../../../../src/verticals/ecommerce/schema/webhook'

const SECRET = 'whsec_test_12345'

function sign(body: Buffer, secret = SECRET): string {
  return createHmac('sha256', secret).update(body).digest('base64')
}

describe('FastSpring webhook verification', () => {
  it('accepts a signature computed over the raw body', () => {
    const body = Buffer.from(JSON.stringify({ events: [] }))
    const headers = { 'x-fs-signature': sign(body) }
    expect(verifyFastSpringWebhook(body, headers, SECRET)).toBe(true)
  })

  it('is case-insensitive on the header name', () => {
    const body = Buffer.from(JSON.stringify({ events: [] }))
    const headers = { 'X-FS-Signature': sign(body) }
    expect(verifyFastSpringWebhook(body, headers, SECRET)).toBe(true)
  })

  it('rejects a signature computed with the wrong secret (fails closed)', () => {
    const body = Buffer.from(JSON.stringify({ events: [] }))
    const headers = { 'x-fs-signature': sign(body, 'wrong-secret') }
    expect(verifyFastSpringWebhook(body, headers, SECRET)).toBe(false)
  })

  it('rejects a body that was tampered with after signing', () => {
    const original = Buffer.from(JSON.stringify({ events: [{ id: '1' }] }))
    const headers = { 'x-fs-signature': sign(original) }
    const tampered = Buffer.from(JSON.stringify({ events: [{ id: '2' }] }))
    expect(verifyFastSpringWebhook(tampered, headers, SECRET)).toBe(false)
  })

  it('fails closed when the signature header is missing', () => {
    const body = Buffer.from(JSON.stringify({ events: [] }))
    expect(verifyFastSpringWebhook(body, {}, SECRET)).toBe(false)
  })
})

describe('FastSpring webhook event parsing', () => {
  it('parses multiple events from a single delivery (unlike single-event platforms)', () => {
    const payload = {
      events: [
        { id: 'evt_1', type: 'account.created', data: { account: 'acct_1' } },
        { id: 'evt_2', type: 'order.completed', data: { order: 'ord_1' } },
      ],
    }
    const events = parseFastSpringWebhookEvents(payload)
    expect(events).toHaveLength(2)
    for (const e of events) expect(WebhookEventSchema.parse(e)).toBeTruthy()

    expect(events[0]).toMatchObject({
      id: 'evt_1',
      platform: 'fastspring',
      resourceType: 'customers',
      action: 'created',
      resourceId: 'acct_1',
    })
    expect(events[1]).toMatchObject({
      resourceType: 'orders',
      action: 'updated',
      resourceId: 'ord_1',
    })
  })

  it('maps return.created to a refunds/created event', () => {
    const events = parseFastSpringWebhookEvents({
      events: [{ id: 'evt_3', type: 'return.created', data: { return: 'ret_1' } }],
    })
    expect(events[0]).toMatchObject({ resourceType: 'refunds', action: 'created', resourceId: 'ret_1' })
  })

  it('maps an out-of-scope event type (subscriptions) to unknown/unknown', () => {
    const events = parseFastSpringWebhookEvents({
      events: [{ id: 'evt_4', type: 'subscription.activated', data: { subscription: 'sub_1' } }],
    })
    expect(WebhookEventSchema.parse(events[0])).toBeTruthy()
    expect(events[0]).toMatchObject({ resourceType: 'unknown', action: 'unknown' })
  })

  it('returns an empty array for a payload with no events', () => {
    expect(parseFastSpringWebhookEvents({})).toEqual([])
  })

  it('exports no Shopify-named aliases (removed so the webhook aggregator generator cannot pick the wrong name)', async () => {
    const mod: Record<string, unknown> = await import(
      '../../../../../../src/verticals/ecommerce/adapters/fastspring/webhook.js'
    )
    expect(Object.keys(mod).sort()).toEqual([
      'fastspringWebhook',
      'parseFastSpringWebhookEvents',
      'verifyFastSpringWebhook',
    ])
  })
})
