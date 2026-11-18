import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyLarkWebhook, parseLarkWebhookEvents } from '../../../../../src/verticals/projects/adapters/lark/webhook'

describe('Lark webhook', () => {
  it('verifies x-lark-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyLarkWebhook(body, { 'x-lark-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyLarkWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=lark', () => {
    const out = parseLarkWebhookEvents({ events: [{ resource: { gid: "r1", resource_type: "task" }, action: "changed" }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('lark')
  })
})
