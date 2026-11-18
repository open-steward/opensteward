import { describe, it, expect } from 'vitest'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema'
import { transformTicket } from '../../../../../../../src/verticals/customer-support/adapters/comm100/transform/ticket'
import { DOC_TICKET } from '../fixtures'

describe('comm100 transformTicket', () => {
  it('maps the documented ticket example to a valid canonical Ticket', () => {
    const t = TicketSchema.parse(transformTicket(DOC_TICKET))
    expect(t.id).toBe('11')
    expect(t.number).toBe('11')
    expect(t.subject).toBe('Chat Transcript with Michael')
    expect(t.status).toBe('open')
    expect(t.priority).toBe('normal')
    expect(t.channel).toBe('unknown')
    expect(t.requesterId).toBe('E23B5D3C-4E7E-4131-9B3A-52B061BA7DE4')
    expect(t.assigneeId).toBe('1487fc9d-92e6-4487-a2e8-92e68d6892e6')
    expect(t.teamId).toBe('91B032D9-0D07-4798-95F7-7EA482BC592C')
    expect(t.tagIds).toEqual(['1487fc9d-92e6-4487-a2e8-92e68d6892e6'])
    expect(t.createdAt).toBe('2021-05-12T08:10:53.480Z')
    expect(t.updatedAt).toBe('2021-04-07T05:59:17.887Z')
    expect(t.resolvedAt).toBeUndefined()
    expect(t.metadata['channelId']).toBe('F9B07E54-0D35-4F53-BA63-1194E4297291')
    expect(t.platform).toBe('comm100')
  })

  it.each([
    ['new', 'open'],
    ['pendingInternal', 'open'],
    ['pendingExternal', 'pending'],
    ['onHold', 'on_hold'],
    ['resolved', 'resolved'],
    ['somethingNew', 'unknown'],
  ])('maps status %s to %s', (status, expected) => {
    expect(TicketSchema.parse(transformTicket({ ...DOC_TICKET, status })).status).toBe(expected)
  })

  it('sets resolvedAt from resolvedTime only on a resolved ticket', () => {
    const t = TicketSchema.parse(transformTicket({ ...DOC_TICKET, status: 'resolved' }))
    expect(t.resolvedAt).toBe('2021-05-12T08:10:53.486Z')
  })

  it('drops a chatbot assignee, which is not a user', () => {
    const t = TicketSchema.parse(transformTicket({ ...DOC_TICKET, assigneeType: 'chatbot' }))
    expect(t.assigneeId).toBeUndefined()
  })

  it('throws instead of inventing a requester or a creation time', () => {
    const { contactOrVisitorId: _c, ...noRequester } = DOC_TICKET
    expect(() => transformTicket(noRequester)).toThrow(/contactOrVisitorId/)
    const { createdTime: _t, ...noCreated } = DOC_TICKET
    expect(() => transformTicket(noCreated)).toThrow(/createdTime/)
  })
})
