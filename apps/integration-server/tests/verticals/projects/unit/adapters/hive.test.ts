import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyHiveWebhook, parseHiveWebhookEvents } from '../../../../../src/verticals/projects/adapters/hive/webhook'

describe('Hive webhook', () => {
  it('verifies x-hive-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyHiveWebhook(body, { 'x-hive-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyHiveWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=hive', () => {
    const out = parseHiveWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('hive')
  })
})
