import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  type RawSysaidActivity,
} from '../../../../../../../src/verticals/customer-support/adapters/sysaid/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

describe('sysaid transformMessage', () => {
  it('maps an agent activity — type=internal, authorType=user', () => {
    const raw: RawSysaidActivity = {
      id: 301,
      srId: 5001,
      description: 'Agent reviewed the request and escalated.',
      actionType: 'note',
      isNote: true,
      agentId: 55,
      userName: 'agent1',
      startTime: '2024-01-15T09:30:00.000Z',
    }

    const result = transformMessage(raw, 'tkt-5001')

    // id maps from raw.id
    expect(result.id).toBe('301')
    // ticketId passed through
    expect(result.ticketId).toBe('tkt-5001')
    // authorId maps from agentId when present
    expect(result.authorId).toBe('55')
    // agentId present → type=internal, authorType=user
    expect(result.type).toBe('internal')
    expect(result.authorType).toBe('user')
    // body maps from description
    expect(result.body).toBe('Agent reviewed the request and escalated.')
    // createdAt maps from startTime
    expect(result.createdAt).toBe('2024-01-15T09:30:00.000Z')
    // platform
    expect(result.platform).toBe('sysaid')

    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('maps an end-user activity — type=public, authorType=contact', () => {
    const raw: RawSysaidActivity = {
      id: 402,
      srId: 5001,
      description: 'I still cannot access the system.',
      endUserId: 101,
      startTime: '2024-01-16T11:00:00.000Z',
    }

    const result = transformMessage(raw, 'tkt-5001')

    // no agentId → type=public
    expect(result.type).toBe('public')
    // endUserId present, no agentId → authorType=contact
    expect(result.authorType).toBe('contact')
    // authorId maps from endUserId
    expect(result.authorId).toBe('101')

    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('maps a system activity — authorType=system when both agentId and endUserId absent', () => {
    const raw: RawSysaidActivity = {
      id: 503,
      srId: 5001,
      description: 'Auto-assigned to IT Support group.',
      userName: 'system',
      startTime: '2024-01-17T08:00:00.000Z',
    }

    const result = transformMessage(raw, 'tkt-5001')

    // no agentId → type=public, no endUserId → authorType=system
    expect(result.authorType).toBe('system')
    expect(result.type).toBe('public')
    // authorId falls back to userName
    expect(result.authorId).toBe('system')

    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('falls back to notes field when description absent', () => {
    const raw: RawSysaidActivity = {
      id: 604,
      notes: 'Check the VPN configuration.',
      agentId: 10,
      startTime: '2024-01-18T07:00:00.000Z',
    }

    const result = transformMessage(raw, 'tkt-99')

    // body from notes when description absent
    expect(result.body).toBe('Check the VPN configuration.')

    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('falls back to epoch when startTime absent', () => {
    const raw: RawSysaidActivity = {
      id: 705,
      description: 'No timestamp',
    }

    const result = transformMessage(raw, 'tkt-1')

    expect(result.createdAt).toBe(new Date(0).toISOString())

    expect(() => MessageSchema.parse(result)).not.toThrow()
  })
})
