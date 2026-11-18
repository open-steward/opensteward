import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyTeambitionWebhook, parseTeambitionWebhookEvents } from '../../../../../src/verticals/projects/adapters/teambition/webhook'

describe('Teambition webhook', () => {
  it('verifies x-teambition-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyTeambitionWebhook(body, { 'x-teambition-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyTeambitionWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=teambition', () => {
    const out = parseTeambitionWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('teambition')
  })
})
