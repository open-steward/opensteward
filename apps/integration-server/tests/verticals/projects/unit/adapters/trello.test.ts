import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyTrelloWebhook, parseTrelloWebhookEvents } from '../../../../../src/verticals/projects/adapters/trello/webhook'

describe('Trello webhook', () => {
  it('verifies x-trello-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyTrelloWebhook(body, { 'x-trello-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyTrelloWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=trello', () => {
    const out = parseTrelloWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('trello')
  })
})
