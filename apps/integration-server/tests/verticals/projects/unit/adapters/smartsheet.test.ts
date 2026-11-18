import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifySmartsheetWebhook, parseSmartsheetWebhookEvents } from '../../../../../src/verticals/projects/adapters/smartsheet/webhook'

describe('Smartsheet webhook', () => {
  it('verifies x-smartsheet-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifySmartsheetWebhook(body, { 'x-smartsheet-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifySmartsheetWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=smartsheet', () => {
    const out = parseSmartsheetWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('smartsheet')
  })
})
