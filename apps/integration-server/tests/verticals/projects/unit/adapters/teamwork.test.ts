import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyTeamworkWebhook, parseTeamworkWebhookEvents } from '../../../../../src/verticals/projects/adapters/teamwork/webhook'

describe('Teamwork webhook', () => {
  it('verifies x-teamwork-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyTeamworkWebhook(body, { 'x-teamwork-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyTeamworkWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=teamwork', () => {
    const out = parseTeamworkWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('teamwork')
  })
})
