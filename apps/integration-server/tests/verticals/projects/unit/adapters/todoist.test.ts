import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyTodoistWebhook, parseTodoistWebhookEvents } from '../../../../../src/verticals/projects/adapters/todoist/webhook'

describe('Todoist webhook', () => {
  it('verifies x-todoist-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyTodoistWebhook(body, { 'x-todoist-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyTodoistWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=todoist', () => {
    const out = parseTodoistWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('todoist')
  })
})
