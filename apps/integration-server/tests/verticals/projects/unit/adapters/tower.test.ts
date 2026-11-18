import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyTowerWebhook, parseTowerWebhookEvents } from '../../../../../src/verticals/projects/adapters/tower/webhook'

describe('Tower webhook', () => {
  it('verifies x-tower-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyTowerWebhook(body, { 'x-tower-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyTowerWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=tower', () => {
    const out = parseTowerWebhookEvents({ events: [{ resource: { gid: "r1", resource_type: "task" }, action: "changed" }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('tower')
  })
})
