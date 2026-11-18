import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyMifielWebhook, parseMifielWebhookEvents } from '../../../../../src/verticals/docsign/adapters/mifiel/webhook'

describe('Mifiel webhook', () => {
  it('verifies x-mifiel-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyMifielWebhook(body, { 'x-mifiel-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyMifielWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=mifiel', () => {
    const out = parseMifielWebhookEvents({ event: 'document.completed', data: { document: { id: 'd1' } } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('mifiel')
  })
})
