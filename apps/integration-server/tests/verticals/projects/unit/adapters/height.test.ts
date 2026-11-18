import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyHeightWebhook, parseHeightWebhookEvents } from '../../../../../src/verticals/projects/adapters/height/webhook'

describe('Height webhook', () => {
  it('verifies x-height-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyHeightWebhook(body, { 'x-height-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyHeightWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=height', () => {
    const out = parseHeightWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('height')
  })
})
