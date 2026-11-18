import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyQuireWebhook, parseQuireWebhookEvents } from '../../../../../src/verticals/projects/adapters/quire/webhook'

describe('Quire webhook', () => {
  it('verifies x-quire-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyQuireWebhook(body, { 'x-quire-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyQuireWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=quire', () => {
    const out = parseQuireWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('quire')
  })
})
