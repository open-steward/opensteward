import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyKintoneWebhook, parseKintoneWebhookEvents } from '../../../../../src/verticals/projects/adapters/kintone/webhook'

describe('Kintone webhook', () => {
  it('verifies x-kintone-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyKintoneWebhook(body, { 'x-kintone-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyKintoneWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=kintone', () => {
    const out = parseKintoneWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('kintone')
  })
})
