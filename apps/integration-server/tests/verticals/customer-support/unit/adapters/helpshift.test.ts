import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawHelpshiftIssue,
} from '../../../../../src/verticals/customer-support/adapters/helpshift/transform/ticket'
import {
  verifyHelpshiftWebhook,
  parseHelpshiftWebhookEvents,
} from '../../../../../src/verticals/customer-support/adapters/helpshift/webhook'

describe('Helpshift transformTicket', () => {
  const base: RawHelpshiftIssue = {
    id: 42,
    title: 'Cannot log in',
    state_data: { state: 'open', changed_at: 1700000000000 },
    created_at: 1699900000000,
  }

  it('maps open state to open status', () => {
    const ticket = transformTicket(base)
    expect(ticket.status).toBe('open')
    expect(ticket.platform).toBe('helpshift')
  })

  it('sets closedAt and resolvedAt when state is closed', () => {
    const raw: RawHelpshiftIssue = {
      ...base,
      state_data: { state: 'closed', changed_at: 1700000000000 },
    }
    const ticket = transformTicket(raw)
    expect(ticket.status).toBe('closed')
    expect(ticket.resolvedAt).toBeTruthy()
    expect(ticket.closedAt).toBeTruthy()
    expect(ticket.closedAt).toBe(ticket.resolvedAt)
  })

  it('sets closedAt when state is rejected', () => {
    const raw: RawHelpshiftIssue = {
      ...base,
      state_data: { state: 'rejected', changed_at: 1700000000000 },
    }
    const ticket = transformTicket(raw)
    expect(ticket.status).toBe('closed')
    expect(ticket.closedAt).toBeTruthy()
  })

  it('sets resolvedAt but NOT closedAt when state is resolved', () => {
    const raw: RawHelpshiftIssue = {
      ...base,
      state_data: { state: 'resolved', changed_at: 1700000000000 },
    }
    const ticket = transformTicket(raw)
    expect(ticket.status).toBe('resolved')
    expect(ticket.resolvedAt).toBeTruthy()
    expect(ticket.closedAt).toBeUndefined()
  })

  it('throws on an issue without created_at rather than inventing one', () => {
    expect(() => transformTicket({ id: 1 })).toThrow(/created_at/)
  })
})

describe('Helpshift webhook', () => {
  it('verifyWebhook always returns true (no HMAC scheme)', () => {
    expect(verifyHelpshiftWebhook(Buffer.from('{}'), {}, 'secret')).toBe(true)
  })

  it('parseWebhookEvents returns array with platform=helpshift', () => {
    const out = parseHelpshiftWebhookEvents({
      event_type: 'create_issue',
      event_id: 'evt1',
      data: { id: 99 },
    })
    expect(Array.isArray(out)).toBe(true)
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('helpshift')
  })

  it('maps create_issue to tickets/created', () => {
    const out = parseHelpshiftWebhookEvents({
      event_type: 'create_issue',
      event_id: 'evt2',
      data: { id: 7 },
    })
    expect(out[0]!.resourceType).toBe('tickets')
    expect(out[0]!.action).toBe('created')
  })

  it('maps add_message_with_attachment_event to messages/commented', () => {
    const out = parseHelpshiftWebhookEvents({
      event_type: 'add_message_with_attachment_event',
      event_id: 'evt3',
      data: { id: 8 },
    })
    expect(out[0]!.resourceType).toBe('messages')
    expect(out[0]!.action).toBe('commented')
  })

  it('does not throw on empty payload', () => {
    expect(() => parseHelpshiftWebhookEvents({})).not.toThrow()
  })
})
