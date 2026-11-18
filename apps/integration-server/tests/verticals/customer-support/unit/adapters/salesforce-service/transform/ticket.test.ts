import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../../../src/verticals/customer-support/adapters/salesforce-service/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'
import { CASE, CLOSED_QUEUE_CASE } from '../fixtures'

describe('transformTicket (Case)', () => {
  it('maps an open, user-owned case and parses as a Ticket', () => {
    const t = TicketSchema.parse(transformTicket(CASE))
    expect(t).toEqual({
      id: '500D000000IRFmaIAH',
      externalId: '500D000000IRFmaIAH',
      number: '00001026',
      subject: 'Unable to log in',
      status: 'open',
      priority: 'high',
      channel: 'email',
      requesterId: '003D000000QOVoIIAX',
      assigneeId: '005D0000005Bk90IAC',
      tagIds: [],
      createdAt: '2026-01-15T09:30:00.000Z',
      updatedAt: '2026-02-01T14:20:00.000Z',
      platform: 'salesforce-service',
      metadata: {
        status: 'Working',
        priority: 'High',
        origin: 'Email',
        accountId: '001D000000IRFmaIAH',
        ownerId: '005D0000005Bk90IAC',
        ownerType: 'User',
      },
      raw: CASE,
    })
  })

  it('a closed, queue-owned child case: closed, team = queue, no assignee, parent kept', () => {
    const t = TicketSchema.parse(transformTicket(CLOSED_QUEUE_CASE))
    expect(t.status).toBe('closed')
    expect(t.closedAt).toBe('2026-02-03T08:00:00.000Z')
    expect(t.teamId).toBe('00GD0000001aBcDMAU')
    expect(t.assigneeId).toBeUndefined()
    expect(t.parentTicketId).toBe('500D000000IRFmaIAH')
    expect(t.priority).toBe('normal')
    expect(t.channel).toBe('voice')
  })

  it('a queue owner reported with any non-User Type is the team, never the assignee', () => {
    const t = TicketSchema.parse(
      transformTicket({ ...CLOSED_QUEUE_CASE, Owner: { Type: 'Queue' } }),
    )
    expect(t.teamId).toBe('00GD0000001aBcDMAU')
    expect(t.assigneeId).toBeUndefined()
  })

  it('org-defined picklist values: unknown priority unset, unknown origin other', () => {
    const t = TicketSchema.parse(
      transformTicket({ ...CASE, Priority: 'P1', Origin: 'Chat', Owner: null, Status: 'On Hold' }),
    )
    expect(t.priority).toBeUndefined()
    expect(t.channel).toBe('other')
    expect(t.assigneeId).toBeUndefined()
    expect(t.teamId).toBeUndefined()
    expect(t.status).toBe('open')
    expect(t.metadata['status']).toBe('On Hold')
  })

  it('a case with only an Id still parses (nullable fields absent)', () => {
    const t = TicketSchema.parse(transformTicket({ Id: '500D000000IRFmcIAH' }))
    expect(t.subject).toBe('')
    expect(t.requesterId).toBe('')
    expect(t.status).toBe('open')
  })
})
