/**
 * Haravan webhook verification — verified against the raw HTML of
 * https://docs.haravan.com/docs/tutorials/webhooks/connect-webhook/ Step 6
 * ("hash_mac ... sha256 ... (data + Client Secret) ... base64 ... compare
 * with X-Haravan-Hmacsha256"), including the PHP example's exact algorithm.
 */
import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyHaravanWebhook, parseHaravanWebhookEvents } from '../../../../../../src/verticals/ecommerce/adapters/haravan/webhook'

describe('verifyHaravanWebhook', () => {
  const secret = 'app_client_secret'
  const body = Buffer.from(JSON.stringify({ id: 123, topic: 'orders/create' }))

  it('accepts a valid base64(HMAC-SHA256(body, clientSecret)) signature', () => {
    const sig = createHmac('sha256', secret).update(body).digest('base64')
    expect(verifyHaravanWebhook(body, { 'x-haravan-hmacsha256': sig }, secret)).toBe(true)
  })

  it('rejects a wrong signature (fail closed)', () => {
    expect(verifyHaravanWebhook(body, { 'x-haravan-hmacsha256': 'bogus==' }, secret)).toBe(false)
  })

  it('rejects a missing header (fail closed)', () => {
    expect(verifyHaravanWebhook(body, {}, secret)).toBe(false)
  })

  it('rejects a signature computed with the wrong secret', () => {
    const sig = createHmac('sha256', 'other-secret').update(body).digest('base64')
    expect(verifyHaravanWebhook(body, { 'x-haravan-hmacsha256': sig }, secret)).toBe(false)
  })
})

describe('parseHaravanWebhookEvents', () => {
  it('maps a "orders/create" topic to resourceType orders / action created', () => {
    const [event] = parseHaravanWebhookEvents({ id: 42, topic: 'orders/create' }, 'orders/create')
    expect(event!.resourceType).toBe('orders')
    expect(event!.action).toBe('created')
    expect(event!.resourceId).toBe('42')
    expect(event!.platform).toBe('haravan')
  })

  it('falls back to unknown/unknown without a topic', () => {
    const [event] = parseHaravanWebhookEvents({ id: 1 })
    expect(event!.resourceType).toBe('unknown')
    expect(event!.action).toBe('unknown')
  })
})
