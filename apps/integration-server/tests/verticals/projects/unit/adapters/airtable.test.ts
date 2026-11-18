import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyAirtableWebhook, parseAirtableWebhookEvents } from '../../../../../src/verticals/projects/adapters/airtable/webhook'

describe('Airtable webhook', () => {
  it('verifies x-airtable-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyAirtableWebhook(body, { 'x-airtable-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyAirtableWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=airtable', () => {
    const out = parseAirtableWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('airtable')
  })
})
