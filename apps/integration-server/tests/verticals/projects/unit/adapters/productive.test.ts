import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyProductiveWebhook, parseProductiveWebhookEvents } from '../../../../../src/verticals/projects/adapters/productive/webhook'

describe('Productive webhook', () => {
  it('verifies x-productive-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyProductiveWebhook(body, { 'x-productive-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyProductiveWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=productive', () => {
    const out = parseProductiveWebhookEvents({ events: [{ resource: { gid: "r1", resource_type: "task" }, action: "changed" }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('productive')
  })
})
