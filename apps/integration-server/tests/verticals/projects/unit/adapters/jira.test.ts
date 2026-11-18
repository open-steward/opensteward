import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyJiraWebhook, parseJiraWebhookEvents } from '../../../../../src/verticals/projects/adapters/jira/webhook'

describe('Jira webhook', () => {
  it('verifies x-jira-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyJiraWebhook(body, { 'x-jira-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyJiraWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=jira', () => {
    const out = parseJiraWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('jira')
  })
})
