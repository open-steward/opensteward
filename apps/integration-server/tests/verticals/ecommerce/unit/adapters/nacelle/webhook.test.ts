/**
 * Verified verbatim against https://docs.nacelle.com/docs/noms-authentication:
 *
 *   signature, _ := strings.CutPrefix(r.Header.Get("x-nacelle-signature-sha256"), "sha256=")
 *   s := hmac.New(sha256.New, []byte(secret)); s.Write(body)
 *   expected := hex.EncodeToString(s.Sum(nil))
 *
 * HMAC-SHA256 over the raw body, HEX-encoded — not base64, which is what the
 * Shopify-derived copy this adapter replaces used (Shopify itself signs
 * base64; that was silently wrong for Nacelle).
 */
import { createHmac } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import {
  verifyNacelleWebhook,
  parseNacelleWebhookEvents,
} from '../../../../../../src/verticals/ecommerce/adapters/nacelle/webhook'

const SECRET = 'whsec_test_secret'

function sign(payload: Buffer, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`
}

describe('verifyNacelleWebhook', () => {
  it('accepts a validly-signed payload', () => {
    const payload = Buffer.from(JSON.stringify({ id: 'ord_1', status: 'paid' }))
    const headers = { 'x-nacelle-signature-sha256': sign(payload) }
    expect(verifyNacelleWebhook(payload, headers, SECRET)).toBe(true)
  })

  it('rejects a base64-encoded signature (the bug this replaces would have accepted the wrong encoding)', () => {
    const payload = Buffer.from(JSON.stringify({ id: 'ord_1' }))
    const base64Sig = `sha256=${createHmac('sha256', SECRET).update(payload).digest('base64')}`
    expect(verifyNacelleWebhook(payload, { 'x-nacelle-signature-sha256': base64Sig }, SECRET)).toBe(false)
  })

  it('rejects a tampered payload', () => {
    const payload = Buffer.from(JSON.stringify({ id: 'ord_1' }))
    const headers = { 'x-nacelle-signature-sha256': sign(payload) }
    const tampered = Buffer.from(JSON.stringify({ id: 'ord_2' }))
    expect(verifyNacelleWebhook(tampered, headers, SECRET)).toBe(false)
  })

  it('rejects the wrong secret', () => {
    const payload = Buffer.from(JSON.stringify({ id: 'ord_1' }))
    const headers = { 'x-nacelle-signature-sha256': sign(payload, SECRET) }
    expect(verifyNacelleWebhook(payload, headers, 'wrong_secret')).toBe(false)
  })

  it('rejects a missing signature header (fail closed)', () => {
    const payload = Buffer.from('{}')
    expect(verifyNacelleWebhook(payload, {}, SECRET)).toBe(false)
  })

  it('requires the sha256= prefix', () => {
    const payload = Buffer.from(JSON.stringify({ id: 'ord_1' }))
    const raw = createHmac('sha256', SECRET).update(payload).digest('hex')
    expect(verifyNacelleWebhook(payload, { 'x-nacelle-signature-sha256': raw }, SECRET)).toBe(false)
  })
})

describe('parseNacelleWebhookEvents', () => {
  it('classifies an order-shaped payload as orders.updated', () => {
    const events = parseNacelleWebhookEvents({ id: 'ord_1', status: 'paid' })
    expect(events).toEqual([
      {
        platform: 'nacelle',
        type: 'orders.updated',
        resourceType: 'orders',
        action: 'updated',
        resourceId: 'ord_1',
        payload: { id: 'ord_1', status: 'paid' },
      },
    ])
  })

  it('falls back to unknown action when the payload has no status field', () => {
    const events = parseNacelleWebhookEvents({ id: 'ord_1' })
    expect(events[0]!.action).toBe('unknown')
    expect(events[0]!.type).toBe('orders.unknown')
  })
})
