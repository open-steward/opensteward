import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyLinearWebhook, parseLinearWebhookEvents } from '../../../../../src/verticals/projects/adapters/linear/webhook'

describe('Linear webhook', () => {
  it('verifies x-linear-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyLinearWebhook(body, { 'x-linear-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyLinearWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=linear', () => {
    const out = parseLinearWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('linear')
  })
})
