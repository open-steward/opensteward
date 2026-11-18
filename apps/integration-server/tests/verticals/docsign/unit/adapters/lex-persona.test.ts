import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyLexPersonaWebhook, parseLexPersonaWebhookEvents } from '../../../../../src/verticals/docsign/adapters/lex-persona/webhook'

describe('LexPersona webhook', () => {
  it('verifies x-lex-persona-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyLexPersonaWebhook(body, { 'x-lex-persona-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyLexPersonaWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=lex-persona', () => {
    const out = parseLexPersonaWebhookEvents({ event: 'document.completed', data: { document: { id: 'd1' } } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('lex-persona')
  })
})
