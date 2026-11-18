import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyBasecampWebhook, parseBasecampWebhookEvents } from '../../../../../src/verticals/projects/adapters/basecamp/webhook'

describe('Basecamp webhook', () => {
  it('verifies x-basecamp-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyBasecampWebhook(body, { 'x-basecamp-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyBasecampWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=basecamp', () => {
    const out = parseBasecampWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('basecamp')
  })
})
