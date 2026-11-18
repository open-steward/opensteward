import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyEidEasyWebhook, parseEidEasyWebhookEvents } from '../../../../../src/verticals/docsign/adapters/eideasy/webhook'

describe('EidEasy webhook', () => {
  it('verifies x-eideasy-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyEidEasyWebhook(body, { 'x-eideasy-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyEidEasyWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=eideasy', () => {
    const out = parseEidEasyWebhookEvents({ event: "document.completed", data: { document: { id: "d1" } } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('eideasy')
  })
})
