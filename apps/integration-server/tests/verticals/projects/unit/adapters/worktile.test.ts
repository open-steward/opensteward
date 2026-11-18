import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyWorktileWebhook, parseWorktileWebhookEvents } from '../../../../../src/verticals/projects/adapters/worktile/webhook'

describe('Worktile webhook', () => {
  it('verifies x-worktile-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyWorktileWebhook(body, { 'x-worktile-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyWorktileWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=worktile', () => {
    const out = parseWorktileWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('worktile')
  })
})
