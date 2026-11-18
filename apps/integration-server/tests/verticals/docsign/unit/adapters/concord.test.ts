import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyConcordWebhook, parseConcordWebhookEvents } from '../../../../../src/verticals/docsign/adapters/concord/webhook'

describe('Concord webhook', () => {
  it('verifies x-concord-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyConcordWebhook(body, { 'x-concord-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyConcordWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=concord', () => {
    const out = parseConcordWebhookEvents({ event: 'document.completed', data: { document: { id: 'd1' } } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('concord')
  })
})
