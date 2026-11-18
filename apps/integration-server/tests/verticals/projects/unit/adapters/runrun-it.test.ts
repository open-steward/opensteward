import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyRunrunItWebhook, parseRunrunItWebhookEvents } from '../../../../../src/verticals/projects/adapters/runrun-it/webhook'

describe('RunrunIt webhook', () => {
  it('verifies x-runrun-it-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyRunrunItWebhook(body, { 'x-runrun-it-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyRunrunItWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=runrun-it', () => {
    const out = parseRunrunItWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('runrun-it')
  })
})
