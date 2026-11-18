import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyZammadWebhook, parseZammadWebhookEvents } from '../../../../../src/verticals/customer-support/adapters/zammad/webhook'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/zammad/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/zammad/transform/message'
import { transformTag } from '../../../../../src/verticals/customer-support/adapters/zammad/transform/tag'

describe('Zammad ticket transform', () => {
  it('maps an open ticket', () => {
    const out = transformTicket({
      id: 10,
      title: 'Login broken',
      state: 'open',
      priority: '2 normal',
      customer_id: 5,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    } as any)
    expect(out.id).toBe('10')
    expect(out.platform).toBe('zammad')
    expect(out.status).toBe('open')
    expect(out.priority).toBe('normal')
  })

  it('maps a closed ticket', () => {
    const out = transformTicket({
      id: 20,
      title: 'Done',
      state: 'closed',
      priority: '3 high',
      customer_id: 7,
      close_at: '2026-03-01T10:00:00Z',
      created_at: '2026-02-01T00:00:00Z',
      updated_at: '2026-03-01T10:00:00Z',
    } as any)
    expect(out.status).toBe('closed')
    expect(out.resolvedAt).toBe('2026-03-01T10:00:00.000Z')
  })
})

describe('Zammad message transform', () => {
  it('maps agent sender to authorType=user', () => {
    const out = transformMessage(
      { id: 1, ticket_id: 10, sender: 'Agent', body: 'Hello', internal: false } as any,
      '10',
    )
    expect(out.authorType).toBe('user')
    expect(out.platform).toBe('zammad')
  })

  it('maps customer sender to authorType=contact', () => {
    const out = transformMessage(
      { id: 2, ticket_id: 10, sender: 'Customer', body: 'Hi', internal: false } as any,
      '10',
    )
    expect(out.authorType).toBe('contact')
  })

  it('maps system sender to authorType=system', () => {
    const out = transformMessage(
      { id: 3, ticket_id: 10, sender: 'System', body: 'Auto-reply', internal: false } as any,
      '10',
    )
    expect(out.authorType).toBe('system')
  })

  it('marks internal articles as type=internal', () => {
    const out = transformMessage(
      { id: 4, ticket_id: 10, sender: 'Agent', body: 'Note', internal: true } as any,
      '10',
    )
    expect(out.type).toBe('internal')
  })
})

describe('Zammad tag transform', () => {
  it('maps a tag with id', () => {
    const out = transformTag({ id: 7, name: 'billing', count: 3 })
    expect(out.id).toBe('7')
    expect(out.name).toBe('billing')
    expect(out.platform).toBe('zammad')
  })

  it('falls back to name as id when id is missing', () => {
    const out = transformTag({ name: 'urgent' } as any)
    expect(out.id).toBe('urgent')
  })
})

describe('Zammad webhook', () => {
  it('verifies HMAC-SHA1 signature', () => {
    const secret = 'mysecret'
    const body = Buffer.from('{"ticket":{"id":1}}')
    const sig = createHmac('sha1', secret).update(body).digest('hex')
    expect(verifyZammadWebhook(body, { 'x-hub-signature': sig }, secret)).toBe(true)
  })

  it('rejects missing signature header', () => {
    expect(verifyZammadWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('rejects wrong signature', () => {
    const body = Buffer.from('{"ticket":{"id":1}}')
    expect(verifyZammadWebhook(body, { 'x-hub-signature': 'bad' }, 'secret')).toBe(false)
  })

  it('parses ticket.created event (article_count=1)', () => {
    const events = parseZammadWebhookEvents({ ticket: { id: 5, article_count: 1 } })
    expect(events).toHaveLength(1)
    expect(events[0]!.platform).toBe('zammad')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceType).toBe('tickets')
  })

  it('parses article.created event', () => {
    const events = parseZammadWebhookEvents({ ticket: { id: 5 }, article: { id: 99 } })
    expect(events).toHaveLength(1)
    expect(events[0]!.resourceType).toBe('messages')
    expect(events[0]!.action).toBe('commented')
  })

  it('returns empty array for unknown payload', () => {
    const events = parseZammadWebhookEvents({})
    expect(events).toHaveLength(0)
  })
})
