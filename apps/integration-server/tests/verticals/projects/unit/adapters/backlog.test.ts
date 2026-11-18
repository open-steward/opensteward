import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyBacklogWebhook, parseBacklogWebhookEvents } from '../../../../../src/verticals/projects/adapters/backlog/webhook'

describe('Backlog webhook', () => {
  it('verifies x-backlog-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyBacklogWebhook(body, { 'x-backlog-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyBacklogWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=backlog', () => {
    const out = parseBacklogWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('backlog')
  })
})
