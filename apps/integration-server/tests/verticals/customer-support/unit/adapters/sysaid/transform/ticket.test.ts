import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawSysaidServiceRecord,
} from '../../../../../../../src/verticals/customer-support/adapters/sysaid/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

describe('sysaid transformTicket', () => {
  it('maps a fully-populated open service record', () => {
    const raw: RawSysaidServiceRecord = {
      id: '5001',
      title: 'VPN access issue',
      description: 'Cannot connect to VPN from home',
      status: { id: 1, caption: 'New', value: 1 },
      priority: { id: 2, caption: 'High', value: 2 },
      source: 2, // Email
      insertTime: '2024-01-15T09:30:00.000Z',
      updateTime: '2024-02-01T14:20:00.000Z',
      requestUser: { id: 101, userName: 'jdoe', displayName: 'Jane Doe' },
      assignee: { id: 55, userName: 'agent1', displayName: 'Agent One' },
      assignedGroup: { id: 10, caption: 'IT Support', value: 10 },
    }

    const result = transformTicket(raw)

    // id maps from raw.id
    expect(result.id).toBe('5001')
    // subject maps from title
    expect(result.subject).toBe('VPN access issue')
    // status: caption 'New' → 'open'
    expect(result.status).toBe('open')
    // priority: caption 'High' → 'high'
    expect(result.priority).toBe('high')
    // channel: source=2 → 'email'
    expect(result.channel).toBe('email')
    // requesterId from requestUser.id
    expect(result.requesterId).toBe('101')
    // assigneeId from assignee.id
    expect(result.assigneeId).toBe('55')
    // teamId from assignedGroup.id
    expect(result.teamId).toBe('10')
    // tagIds always empty
    expect(result.tagIds).toEqual([])
    // platform
    expect(result.platform).toBe('sysaid')

    expect(() => TicketSchema.parse(result)).not.toThrow()
  })

  it('maps a resolved ticket with closeTime → resolvedAt', () => {
    const raw: RawSysaidServiceRecord = {
      id: '5002',
      title: 'Password reset completed',
      status: { id: 4, caption: 'Resolved', value: 4 },
      priority: { caption: 'Low' },
      source: 3, // Web portal
      insertTime: '2024-02-01T10:00:00.000Z',
      updateTime: '2024-02-05T12:00:00.000Z',
      closeTime: '2024-02-05T12:00:00.000Z',
      requestUser: { id: 200 },
    }

    const result = transformTicket(raw)

    expect(result.status).toBe('resolved')
    expect(result.priority).toBe('low')
    // channel: source=3 → 'web'
    expect(result.channel).toBe('web')
    // resolvedAt from closeTime for resolved tickets
    expect(result.resolvedAt).toBe('2024-02-05T12:00:00.000Z')

    expect(() => TicketSchema.parse(result)).not.toThrow()
  })

  it('maps in_progress and on_hold status captions', () => {
    const pending: RawSysaidServiceRecord = {
      id: '1',
      status: { caption: 'In Progress' },
      insertTime: '2024-01-01T00:00:00.000Z',
    }
    expect(transformTicket(pending).status).toBe('in_progress')

    const onHold: RawSysaidServiceRecord = {
      id: '2',
      status: { caption: 'On Hold' },
      insertTime: '2024-01-01T00:00:00.000Z',
    }
    expect(transformTicket(onHold).status).toBe('on_hold')
  })

  it('falls back to numeric id heuristic when caption is blank', () => {
    // id=3 → pending, id=5 → closed
    const rawPending: RawSysaidServiceRecord = {
      id: '3',
      status: { id: 3, caption: '' },
      insertTime: '2024-01-01T00:00:00.000Z',
    }
    expect(transformTicket(rawPending).status).toBe('pending')

    const rawClosed: RawSysaidServiceRecord = {
      id: '4',
      status: { id: 5, caption: '' },
      insertTime: '2024-01-01T00:00:00.000Z',
    }
    expect(transformTicket(rawClosed).status).toBe('closed')
  })

  it('maps phone channel (source=1) and urgent priority', () => {
    const raw: RawSysaidServiceRecord = {
      id: '6001',
      title: 'Critical outage',
      status: { caption: 'open' },
      priority: { caption: 'Critical' },
      source: 1, // Phone
      insertTime: '2024-06-01T00:00:00.000Z',
      requestUser: '999',
    }

    const result = transformTicket(raw)

    expect(result.channel).toBe('voice')
    expect(result.priority).toBe('urgent')
    // string requestUser extracted via extractId
    expect(result.requesterId).toBe('999')

    expect(() => TicketSchema.parse(result)).not.toThrow()
  })
})
