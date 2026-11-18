/**
 * otobo transformTicket.
 *
 * Fixtures follow the documented TicketGet response in
 * Kernel/GenericInterface/Operation/Ticket/TicketGet.pm (rel-11_0):
 *   TicketNumber => '20101027000001', Title => 'some title', TicketID => 123,
 *   State, StateType, Priority, Queue, QueueID, CustomerID, CustomerUserID,
 *   Owner, OwnerID, Lock, Created => '2010-10-27 20:15:00',
 *   Changed => '2010-10-27 20:15:15'
 * with the default state, state-type and priority names from
 * scripts/database/otobo-initial_insert.xml.
 */
import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawOtoboTicket,
} from '../../../../../../../src/verticals/customer-support/adapters/otobo/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

function documented(overrides: Partial<RawOtoboTicket> = {}): RawOtoboTicket {
  return {
    TicketNumber: '20101027000001',
    Title: 'some title',
    TicketID: 123,
    State: 'open',
    StateID: 4,
    StateType: 'open',
    Priority: '3 normal',
    PriorityID: 3,
    Lock: 'unlock',
    LockID: 1,
    Queue: 'Raw',
    QueueID: 2,
    CustomerID: 'customer_id_123',
    CustomerUserID: 'customer_user_id_123',
    Owner: 'some_owner_login',
    OwnerID: 123,
    Type: 'Unclassified',
    TypeID: 1,
    Responsible: 'some_responsible_login',
    ResponsibleID: 123,
    Age: 3456,
    Created: '2010-10-27 20:15:00',
    CreateBy: 123,
    Changed: '2010-10-27 20:15:15',
    ChangeBy: 123,
    ArchiveFlag: 'n',
    ...overrides,
  }
}

describe('otobo transformTicket', () => {
  it('maps the documented TicketGet example to a canonical Ticket', () => {
    const result = TicketSchema.parse(transformTicket(documented()))

    expect(result.id).toBe('123')
    expect(result.externalId).toBe('123')
    expect(result.number).toBe('20101027000001')
    expect(result.subject).toBe('some title')
    expect(result.status).toBe('open')
    expect(result.priority).toBe('normal')
    expect(result.requesterId).toBe('customer_user_id_123')
    expect(result.assigneeId).toBe('123')
    expect(result.teamId).toBe('2')
    expect(result.tagIds).toEqual([])
    expect(result.platform).toBe('otobo')
    expect(result.metadata).toMatchObject({
      queue: 'Raw',
      state: 'open',
      stateType: 'open',
      priority: '3 normal',
      lock: 'unlock',
      owner: 'some_owner_login',
      customerID: 'customer_id_123',
      type: 'Unclassified',
    })
  })

  it('reads Created/Changed as OTOBOTimeZone (default UTC) timestamps', () => {
    const result = TicketSchema.parse(transformTicket(documented()))
    expect(result.createdAt).toBe('2010-10-27T20:15:00.000Z')
    expect(result.updatedAt).toBe('2010-10-27T20:15:15.000Z')
  })

  it('has no documented per-ticket channel, so channel is unknown', () => {
    const result = TicketSchema.parse(transformTicket(documented()))
    expect(result.channel).toBe('unknown')
  })

  it('does not invent resolvedAt/closedAt from Changed', () => {
    const result = TicketSchema.parse(
      transformTicket(documented({ State: 'closed successful', StateType: 'closed' })),
    )
    expect(result.status).toBe('closed')
    expect(result.resolvedAt).toBeUndefined()
    expect(result.closedAt).toBeUndefined()
  })

  it.each([
    ['new', 'open'],
    ['open', 'open'],
    ['pending reminder', 'pending'],
    ['pending auto', 'pending'],
    ['closed', 'closed'],
    ['removed', 'closed'],
    ['merged', 'closed'],
    ['some state type', 'unknown'],
  ] as const)('maps StateType %s → %s', (stateType, expected) => {
    const result = TicketSchema.parse(transformTicket(documented({ StateType: stateType })))
    expect(result.status).toBe(expected)
  })

  it.each([
    ['1 very low', 'low'],
    ['2 low', 'low'],
    ['3 normal', 'normal'],
    ['4 high', 'high'],
    ['5 very high', 'urgent'],
    ['some priority', 'unknown'],
  ] as const)('maps Priority %s → %s', (priority, expected) => {
    const result = TicketSchema.parse(transformTicket(documented({ Priority: priority })))
    expect(result.priority).toBe(expected)
  })

  it('throws rather than inventing createdAt when Created is missing or malformed', () => {
    expect(() => transformTicket(documented({ Created: undefined }))).toThrow(/Created/)
    expect(() => transformTicket(documented({ Created: 'yesterday' }))).toThrow(/Created/)
    // Only the exact 'YYYY-MM-DD HH:MM:SS' shape is read; nothing around it is guessed at
    expect(() => transformTicket(documented({ Created: '2010-10-27 20:15:00+02:00' }))).toThrow(
      /Created/,
    )
    expect(() => transformTicket(documented({ Created: 'x2010-10-27 20:15:00' }))).toThrow(
      /Created/,
    )
  })
})
