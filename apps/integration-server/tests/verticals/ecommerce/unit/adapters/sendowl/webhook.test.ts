/**
 * SendOwl webhook verification and event parsing.
 *
 * Verified against https://help.sendowl.com/help/using-web-hooks
 * (2026-09-13): the header is `X-SENDOWL-HMAC-SHA256`, computed as
 * base64(HMAC-SHA256(raw_request_body, signing_key_secret)) — the docs'
 * own Ruby example:
 *
 *   digest = OpenSSL::Digest.new('sha256')
 *   calculated_hmac = Base64.encode64(
 *     OpenSSL::HMAC.digest(digest, YOUR_SIGNING_KEY_SECRET, request.raw_post)
 *   ).strip
 *   calculated_hmac == request.headers["HTTP_X_SENDOWL_HMAC_SHA256"]
 */
import { createHmac } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import {
  verifySendOwlWebhook,
  parseSendOwlWebhookEvents,
} from '../../../../../../src/verticals/ecommerce/adapters/sendowl/webhook'

const SECRET = 'test-signing-key-secret'

function sign(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(body).digest('base64')
}

describe('verifySendOwlWebhook', () => {
  it('accepts a signature computed the documented way', () => {
    const body = Buffer.from('{"order_id":3101}')
    const headers = { 'x-sendowl-hmac-sha256': sign(body.toString()) }
    expect(verifySendOwlWebhook(body, headers, SECRET)).toBe(true)
  })

  it('rejects a body that does not match the signature', () => {
    const headers = { 'x-sendowl-hmac-sha256': sign('{"order_id":3101}') }
    expect(verifySendOwlWebhook(Buffer.from('{"order_id":9999}'), headers, SECRET)).toBe(false)
  })

  it('rejects when the header is missing', () => {
    expect(verifySendOwlWebhook(Buffer.from('{}'), {}, SECRET)).toBe(false)
  })

  it('rejects a signature made with the wrong secret', () => {
    const body = '{"order_id":3101}'
    const headers = { 'x-sendowl-hmac-sha256': sign(body, 'wrong-secret') }
    expect(verifySendOwlWebhook(Buffer.from(body), headers, SECRET)).toBe(false)
  })

  it('never throws on a malformed/empty secret', () => {
    expect(() => verifySendOwlWebhook(Buffer.from('{}'), {}, '')).not.toThrow()
  })
})

describe('parseSendOwlWebhookEvents', () => {
  // SendOwl's docs name 15 events by dashboard display label only — the
  // machine-readable event-name string is never documented, so this parser
  // does not attempt to classify resourceType/action. See the module's
  // header comment for the full reasoning.

  it('reports resourceType/action as unknown, using the embedded order id', () => {
    const events = parseSendOwlWebhookEvents({ order: { id: 3101 } })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      platform: 'sendowl',
      type: 'unknown.unknown',
      resourceType: 'unknown',
      action: 'unknown',
      resourceId: '3101',
    })
  })

  it('falls back to a top-level id when there is no nested order object', () => {
    const events = parseSendOwlWebhookEvents({ id: 42 })
    expect(events[0]).toMatchObject({ resourceId: '42' })
  })

  it('drops the delivery entirely when no id can be found — never fabricates a resourceId', () => {
    expect(parseSendOwlWebhookEvents({})).toEqual([])
  })
})
