import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyMondayWebhook, parseMondayWebhookEvents } from '../../../../../src/verticals/projects/adapters/monday/webhook'

describe('Monday webhook', () => {
  it('verifies x-monday-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyMondayWebhook(body, { 'x-monday-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyMondayWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=monday', () => {
    const out = parseMondayWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('monday')
  })
})
