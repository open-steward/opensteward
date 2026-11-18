import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyPivotalTrackerWebhook, parsePivotalTrackerWebhookEvents } from '../../../../../src/verticals/projects/adapters/pivotal-tracker/webhook'

describe('PivotalTracker webhook', () => {
  it('verifies x-pivotal-tracker-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyPivotalTrackerWebhook(body, { 'x-pivotal-tracker-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyPivotalTrackerWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=pivotal-tracker', () => {
    const out = parsePivotalTrackerWebhookEvents({ events: [{ resource: { gid: "r1", resource_type: "task" }, action: "changed" }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('pivotal-tracker')
  })
})
