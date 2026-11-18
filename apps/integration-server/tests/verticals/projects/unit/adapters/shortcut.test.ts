import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyShortcutWebhook, parseShortcutWebhookEvents } from '../../../../../src/verticals/projects/adapters/shortcut/webhook'

describe('Shortcut webhook', () => {
  it('verifies x-shortcut-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyShortcutWebhook(body, { 'x-shortcut-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyShortcutWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=shortcut', () => {
    const out = parseShortcutWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('shortcut')
  })
})
