/**
 * helpdesk.ticket rows. Field names from Odoo's own demo data
 * (github.com/odoo/industry 19.0, the demo/helpdesk_ticket.xml files); priority stars
 * from odoo/documentation 19.0 helpdesk/overview/receiving_tickets.rst.
 */
import { describe, expect, it } from 'vitest'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema'
import { transformTicket } from '../../../../../../../src/verticals/customer-support/adapters/odoo-helpdesk/transform/ticket'

const base = {
  id: 7,
  name: 'Delivery Issue',
  ticket_ref: '07',
  partner_id: [17, 'May J. Cooper'] as [number, string],
  partner_name: false as const,
  user_id: [2, 'Mitchell Admin'] as [number, string],
  team_id: [1, 'Customer Care'] as [number, string],
  stage_id: [1, 'New'] as [number, string],
  priority: '2',
  assign_date: '2026-01-02 08:00:00',
  close_date: false as const,
  create_date: '2026-01-01 09:30:00',
  write_date: '2026-01-03 10:00:00',
}

describe('odoo-helpdesk transformTicket', () => {
  it('maps an open ticket', () => {
    const t = TicketSchema.parse(transformTicket(base))
    expect(t).toMatchObject({
      id: '7',
      externalId: '7',
      number: '07',
      subject: 'Delivery Issue',
      status: 'open',
      priority: 'high',
      channel: 'unknown',
      requesterId: '17',
      assigneeId: '2',
      teamId: '1',
      tagIds: [],
      createdAt: '2026-01-01T09:30:00.000Z',
      updatedAt: '2026-01-03T10:00:00.000Z',
      platform: 'odoo-helpdesk',
    })
    expect(t.closedAt).toBeUndefined()
    expect(t.metadata).toEqual({
      stageId: '1',
      stage: 'New',
      team: 'Customer Care',
      requesterName: 'May J. Cooper',
      rawPriority: '2',
      assignedAt: '2026-01-02T08:00:00.000Z',
    })
  })

  it('a ticket with a close_date is closed, with closedAt', () => {
    const t = TicketSchema.parse(
      transformTicket({ ...base, stage_id: [4, 'Solved'], close_date: '2026-01-05 12:00:00' }),
    )
    expect(t.status).toBe('closed')
    expect(t.closedAt).toBe('2026-01-05T12:00:00.000Z')
    expect(t.metadata['stage']).toBe('Solved')
  })

  it.each([
    ['0', 'low'],
    ['1', 'normal'],
    ['2', 'high'],
    ['3', 'urgent'],
  ])('priority %s stars is %s', (priority, expected) => {
    expect(TicketSchema.parse(transformTicket({ ...base, priority })).priority).toBe(expected)
  })

  it('an unknown priority value is left out, raw kept', () => {
    const t = TicketSchema.parse(transformTicket({ ...base, priority: '9' }))
    expect(t.priority).toBeUndefined()
    expect(t.metadata['rawPriority']).toBe('9')
  })

  it('a ticket with only a typed customer name has an empty requesterId', () => {
    const t = TicketSchema.parse(
      transformTicket({ ...base, partner_id: false, partner_name: 'Saddlebrook Resort' }),
    )
    expect(t.requesterId).toBe('')
    expect(t.metadata['requesterName']).toBe('Saddlebrook Resort')
  })

  it('tolerates every optional field missing (fields_get dropped them)', () => {
    const t = TicketSchema.parse(transformTicket({ id: 3 }))
    expect(t).toMatchObject({
      id: '3',
      subject: '',
      status: 'open',
      requesterId: '',
      channel: 'unknown',
      createdAt: '1970-01-01T00:00:00.000Z',
    })
    expect(t.number).toBeUndefined()
    expect(t.assigneeId).toBeUndefined()
    expect(t.teamId).toBeUndefined()
    expect(t.updatedAt).toBeUndefined()
    expect(t.metadata).toEqual({})
  })
})
