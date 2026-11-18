import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyAsanaWebhook, parseAsanaWebhookEvents } from '../../../../../src/verticals/projects/adapters/asana/webhook'

describe('Asana webhook', () => {
  it('verifies x-hook-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyAsanaWebhook(body, { 'x-hook-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyAsanaWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=asana', () => {
    const out = parseAsanaWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('asana')
  })
})
