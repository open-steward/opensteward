import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyKanbanizeWebhook, parseKanbanizeWebhookEvents } from '../../../../../src/verticals/projects/adapters/kanbanize/webhook'

describe('Kanbanize webhook', () => {
  it('verifies x-kanbanize-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyKanbanizeWebhook(body, { 'x-kanbanize-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyKanbanizeWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=kanbanize', () => {
    const out = parseKanbanizeWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('kanbanize')
  })
})
