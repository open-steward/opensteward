import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawVivantioTicket,
} from '../../../../../../../src/verticals/customer-support/adapters/vivantio/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

describe('vivantio transformTicket', () => {
  it('maps a fully-populated open ticket via email', () => {
    const raw: RawVivantioTicket = {
      Id: 1001,
      DisplayId: 'TKT-1001',
      Title: 'Cannot access VPN',
      StatusType: 0, // Open
      StatusName: 'Open',
      PriorityName: 'High',
      CallOrigin: 2, // Email
      CallerId: 200,
      OwnerId: 55,
      GroupId: 10,
      OpenDate: '2024-01-15T09:30:00.000Z',
      LastModifiedDate: '2024-02-01T14:20:00.000Z',
    }

    const result = transformTicket(raw)

    // id maps from Id (number)
    expect(result.id).toBe('1001')
    // externalId and number map from DisplayId
    expect(result.externalId).toBe('TKT-1001')
    expect(result.number).toBe('TKT-1001')
    // subject maps from Title
    expect(result.subject).toBe('Cannot access VPN')
    // status: StatusType=0 → 'open'
    expect(result.status).toBe('open')
    // priority: PriorityName 'High' → 'high'
    expect(result.priority).toBe('high')
    // channel: CallOrigin=2 → 'email'
    expect(result.channel).toBe('email')
    // requesterId from CallerId
    expect(result.requesterId).toBe('200')
    // assigneeId from OwnerId
    expect(result.assigneeId).toBe('55')
    // teamId from GroupId
    expect(result.teamId).toBe('10')
    // tagIds always empty
    expect(result.tagIds).toEqual([])
    // platform
    expect(result.platform).toBe('vivantio')
    // resolvedAt undefined for open ticket
    expect(result.resolvedAt).toBeUndefined()

    expect(() => TicketSchema.parse(result)).not.toThrow()
  })

  it('maps StatusType=2 (Resolved) with ResolvedDate', () => {
    const raw: RawVivantioTicket = {
      Id: 2002,
      Title: 'Fixed issue',
      StatusType: 2, // Resolved
      PriorityName: 'Normal',
      CallOrigin: 3, // Web
      CallerId: 300,
      OpenDate: '2024-02-01T10:00:00.000Z',
      ResolvedDate: '2024-02-10T15:00:00.000Z',
      LastModifiedDate: '2024-02-10T15:00:00.000Z',
    }

    const result = transformTicket(raw)

    expect(result.status).toBe('resolved')
    // priority: 'Normal' → 'normal'
    expect(result.priority).toBe('normal')
    // channel: CallOrigin=3 → 'web'
    expect(result.channel).toBe('web')
    // resolvedAt set for resolved tickets, preferring ResolvedDate
    expect(result.resolvedAt).toBe('2024-02-10T15:00:00.000Z')

    expect(() => TicketSchema.parse(result)).not.toThrow()
  })

  it('maps StatusType=3 (Closed), 4 (On Hold), 1 (Pending)', () => {
    const makeClosed = (): RawVivantioTicket => ({
      Id: 1,
      StatusType: 3,
      CallerId: null,
      OpenDate: '2024-01-01T00:00:00.000Z',
      CloseDate: '2024-01-10T00:00:00.000Z',
    })
    const makeOnHold = (): RawVivantioTicket => ({
      Id: 2,
      StatusType: 4,
      OpenDate: '2024-01-01T00:00:00.000Z',
    })
    const makePending = (): RawVivantioTicket => ({
      Id: 3,
      StatusType: 1,
      OpenDate: '2024-01-01T00:00:00.000Z',
    })

    expect(transformTicket(makeClosed()).status).toBe('closed')
    expect(transformTicket(makeOnHold()).status).toBe('on_hold')
    expect(transformTicket(makePending()).status).toBe('pending')
  })

  it('maps phone (1), api (4), chat (5) CallOrigin values', () => {
    const make = (origin: number): RawVivantioTicket => ({
      Id: 10,
      CallOrigin: origin,
      OpenDate: '2024-01-01T00:00:00.000Z',
    })

    expect(transformTicket(make(1)).channel).toBe('voice')
    expect(transformTicket(make(4)).channel).toBe('api')
    expect(transformTicket(make(5)).channel).toBe('chat')
  })

  it('maps urgent and low priorities', () => {
    const makeTicket = (p: string): RawVivantioTicket => ({
      Id: 1,
      PriorityName: p,
      OpenDate: '2024-01-01T00:00:00.000Z',
    })

    expect(transformTicket(makeTicket('Critical')).priority).toBe('urgent')
    expect(transformTicket(makeTicket('Low')).priority).toBe('low')
    expect(transformTicket(makeTicket('Medium')).priority).toBe('normal')
  })

  it('handles missing optional fields gracefully', () => {
    const raw: RawVivantioTicket = {
      Id: 9999,
    }

    const result = transformTicket(raw)

    expect(result.id).toBe('9999')
    expect(result.subject).toBe('')
    expect(result.requesterId).toBe('')
    expect(result.assigneeId).toBeUndefined()
    expect(result.teamId).toBeUndefined()
    expect(result.channel).toBe('other')
    expect(result.status).toBe('open')

    expect(() => TicketSchema.parse(result)).not.toThrow()
  })
})
