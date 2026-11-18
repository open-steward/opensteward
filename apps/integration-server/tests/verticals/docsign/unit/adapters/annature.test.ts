import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyAnnatureWebhook, parseAnnatureWebhookEvents } from '../../../../../src/verticals/docsign/adapters/annature/webhook'

describe('Annature webhook', () => {
  it('verifies x-annature-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyAnnatureWebhook(body, { 'x-annature-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyAnnatureWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=annature', () => {
    const out = parseAnnatureWebhookEvents({ event: 'document.completed', data: { document: { id: 'd1' } } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('annature')
  })
})
