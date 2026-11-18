/**
 * Fixtures are the response examples of GET /api/v1/tickets/{ticket_id} and
 * GET /api/v1/tickets (https://desk.zoho.com/DeskAPIDocument, Tickets),
 * trimmed to the fields the transform reads.
 */
import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawZohoDeskTicket,
} from '../../../../../../../src/verticals/customer-support/adapters/zoho-desk/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema'

const GET_TICKET: RawZohoDeskTicket = {
  modifiedTime: '2016-06-21T13:16:14.000Z',
  statusType: 'Open',
  subject:
    'Hi. There is a sudden delay in the processing of the orders. Check this with high priority',
  departmentId: '1892000000006907',
  channel: 'FORUMS',
  closedTime: null,
  createdTime: '2013-11-04T11:21:07.000Z',
  id: '1892000000042034',
  contactId: '1892000000042032',
  priority: 'High',
  status: 'Open',
  ticketNumber: '101',
  assigneeId: '1892000000056007',
  teamId: '8920000000069071',
  tagCount: '2',
}

describe('transformTicket', () => {
  it('maps the documented get-ticket example', () => {
    const t = TicketSchema.parse(transformTicket(GET_TICKET))
    expect(t).toMatchObject({
      id: '1892000000042034',
      externalId: '1892000000042034',
      number: '101',
      status: 'open',
      priority: 'high',
      channel: 'other',
      requesterId: '1892000000042032',
      assigneeId: '1892000000056007',
      teamId: '8920000000069071',
      tagIds: [],
      createdAt: '2013-11-04T11:21:07.000Z',
      updatedAt: '2016-06-21T13:16:14.000Z',
      platform: 'zoho-desk',
    })
    expect(t.closedAt).toBeUndefined()
    expect(t.metadata).toMatchObject({
      departmentId: '1892000000006907',
      rawStatus: 'Open',
      rawChannel: 'FORUMS',
    })
  })

  it('reads statusType (OPEN / ONHOLD / CLOSED, sent as "On Hold" / "Closed") before status', () => {
    expect(
      TicketSchema.parse(transformTicket({ id: '1', statusType: 'On Hold', status: 'Escalated' }))
        .status,
    ).toBe('on_hold')
    expect(
      TicketSchema.parse(
        transformTicket({ id: '1', statusType: 'CLOSED', closedTime: '2016-06-01T14:04:07.000Z' }),
      ),
    ).toMatchObject({
      status: 'closed',
      closedAt: '2016-06-01T14:04:07.000Z',
    })
    expect(TicketSchema.parse(transformTicket({ id: '1', statusType: 'ONHOLD' })).status).toBe(
      'on_hold',
    )
  })

  it('falls back to status when the list omits statusType, and a custom status is unknown', () => {
    expect(TicketSchema.parse(transformTicket({ id: '1', status: 'Closed' })).status).toBe('closed')
    expect(TicketSchema.parse(transformTicket({ id: '1', status: 'Escalated' })).status).toBe(
      'unknown',
    )
  })

  it('maps documented priorities and channels, leaving custom ones out', () => {
    const low = TicketSchema.parse(transformTicket({ id: '1', priority: 'Low', channel: 'Email' }))
    expect(low).toMatchObject({ priority: 'low', channel: 'email' })
    expect(
      TicketSchema.parse(transformTicket({ id: '1', priority: 'Medium', channel: 'Phone' })),
    ).toMatchObject({ priority: 'normal', channel: 'voice' })
    expect(
      TicketSchema.parse(
        transformTicket({ id: '1', priority: '4000000018011', channel: 'FACEBOOK' }),
      ),
    ).toMatchObject({ channel: 'social' })
    expect(transformTicket({ id: '1', priority: '-' }).priority).toBeUndefined()
  })

  it('survives a minimal row', () => {
    const t = TicketSchema.parse(transformTicket({ id: 5 }))
    expect(t).toMatchObject({
      id: '5',
      subject: '',
      requesterId: '',
      status: 'unknown',
      channel: 'other',
    })
  })
})
