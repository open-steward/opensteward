import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyYouTrackWebhook, parseYouTrackWebhookEvents } from '../../../../../src/verticals/projects/adapters/youtrack/webhook'

describe('YouTrack webhook', () => {
  it('verifies x-youtrack-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyYouTrackWebhook(body, { 'x-youtrack-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyYouTrackWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=youtrack', () => {
    const out = parseYouTrackWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('youtrack')
  })
})
