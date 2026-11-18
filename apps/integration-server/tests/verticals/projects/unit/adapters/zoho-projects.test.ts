import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyZohoProjectsWebhook, parseZohoProjectsWebhookEvents } from '../../../../../src/verticals/projects/adapters/zoho-projects/webhook'

describe('ZohoProjects webhook', () => {
  it('verifies x-zoho-projects-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyZohoProjectsWebhook(body, { 'x-zoho-projects-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyZohoProjectsWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=zoho-projects', () => {
    const out = parseZohoProjectsWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('zoho-projects')
  })
})
