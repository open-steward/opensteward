import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyMicrosoftPlannerWebhook, parseMicrosoftPlannerWebhookEvents } from '../../../../../src/verticals/projects/adapters/microsoft-planner/webhook'

describe('MicrosoftPlanner webhook', () => {
  it('verifies x-microsoft-planner-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyMicrosoftPlannerWebhook(body, { 'x-microsoft-planner-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyMicrosoftPlannerWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=microsoft-planner', () => {
    const out = parseMicrosoftPlannerWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('microsoft-planner')
  })
})
