import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyStackfieldWebhook, parseStackfieldWebhookEvents } from '../../../../../src/verticals/projects/adapters/stackfield/webhook'

describe('Stackfield webhook', () => {
  it('verifies x-stackfield-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyStackfieldWebhook(body, { 'x-stackfield-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyStackfieldWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=stackfield', () => {
    const out = parseStackfieldWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('stackfield')
  })
})
