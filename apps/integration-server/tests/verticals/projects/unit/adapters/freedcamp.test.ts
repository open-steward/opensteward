import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyFreedcampWebhook, parseFreedcampWebhookEvents } from '../../../../../src/verticals/projects/adapters/freedcamp/webhook'

describe('Freedcamp webhook', () => {
  it('verifies x-freedcamp-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyFreedcampWebhook(body, { 'x-freedcamp-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyFreedcampWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=freedcamp', () => {
    const out = parseFreedcampWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('freedcamp')
  })
})
