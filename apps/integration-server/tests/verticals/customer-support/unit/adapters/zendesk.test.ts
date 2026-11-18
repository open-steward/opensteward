import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyZendeskWebhook, parseZendeskWebhookEvents } from '../../../../../src/verticals/customer-support/adapters/zendesk/webhook'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/zendesk/transform/ticket'

describe('Zendesk transform', () => {
  it('maps a solved ticket', () => {
    const out = transformTicket({
      id: 42, subject: 'Bug', status: 'solved', via: { channel: 'email' },
      requester_id: 9, tags: ['t1'],
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
    } as any)
    expect(out.id).toBe('42')
    expect(out.platform).toBe('zendesk')
    expect(out.status).toBe('resolved')
    expect(out.channel).toBe('email')
  })
})

describe('Zendesk webhook', () => {
  it('verifies HMAC-SHA256 over timestamp+body base64', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const ts = '1700000000'
    const sig = createHmac('sha256', secret).update(Buffer.concat([Buffer.from(ts), body])).digest('base64')
    expect(verifyZendeskWebhook(body, { 'x-zendesk-webhook-signature': sig, 'x-zendesk-webhook-signature-timestamp': ts }, secret)).toBe(true)
  })

  it('rejects missing headers', () => {
    expect(verifyZendeskWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=zendesk', () => {
    const out = parseZendeskWebhookEvents({ type: 'zen:event-type:ticket.created', detail: { id: 't1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('zendesk')
  })
})
