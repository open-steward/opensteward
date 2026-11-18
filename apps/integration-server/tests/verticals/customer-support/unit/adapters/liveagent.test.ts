import { describe, it, expect } from 'vitest'
import { transformTag } from '../../../../../src/verticals/customer-support/adapters/liveagent/transform/tag'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/liveagent/transform/ticket'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/liveagent/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/liveagent/transform/user'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/liveagent/transform/team'
import { transformMacro } from '../../../../../src/verticals/customer-support/adapters/liveagent/transform/macro'
import { transformMessageGroup } from '../../../../../src/verticals/customer-support/adapters/liveagent/transform/message'

describe('LiveAgent transformTag', () => {
  it('sets color at the top level and in metadata', () => {
    const out = transformTag({ id: 't1', name: 'vip', color: '#ff0000' })
    expect(out.color).toBe('#ff0000')
    expect(out.metadata['color']).toBe('#ff0000')
  })

  it('leaves color undefined when absent', () => {
    const out = transformTag({ id: 't2', name: 'plain' })
    expect(out.color).toBeUndefined()
  })

  it('sets platform=liveagent', () => {
    const out = transformTag({ id: 't3', name: 'test' })
    expect(out.platform).toBe('liveagent')
  })

  it('uses name as id fallback when id is absent', () => {
    const out = transformTag({ name: 'fallback' })
    expect(out.id).toBe('fallback')
  })

  it('does not throw on empty input', () => {
    expect(() => transformTag({})).not.toThrow()
  })
})

describe('LiveAgent transformTicket', () => {
  it('maps an open ticket', () => {
    const out = transformTicket({
      id: 'abc123',
      code: 'T-1',
      subject: 'Login issue',
      status: 'C',
      channel_type: 'E',
      owner_contactid: 'c1',
      date_created: '2026-01-01T10:00:00Z',
    })
    expect(out.id).toBe('abc123')
    expect(out.platform).toBe('liveagent')
    expect(out.status).toBe('open')
    expect(out.channel).toBe('email')
    expect(out.requesterId).toBe('c1')
  })

  it('maps a resolved ticket', () => {
    const out = transformTicket({ id: 'r1', status: 'R', date_changed: '2026-02-01T00:00:00Z' })
    expect(out.status).toBe('resolved')
  })

  it('maps a deleted ticket to closed', () => {
    const out = transformTicket({ id: 'd1', status: 'X' })
    expect(out.status).toBe('closed')
  })

  it('parses comma-separated tags', () => {
    const out = transformTicket({ id: 'tg1', tags: 'vip,priority,billing' })
    expect(out.tagIds).toEqual(['vip', 'priority', 'billing'])
  })

  it('does not throw on empty input', () => {
    expect(() => transformTicket({})).not.toThrow()
  })
})

describe('LiveAgent transformContact', () => {
  it('builds full name from firstname + lastname', () => {
    const out = transformContact({ id: 'con1', firstname: 'Jane', lastname: 'Smith', registration_email: 'jane@example.com' })
    expect(out.name).toBe('Jane Smith')
    expect(out.email).toBe('jane@example.com')
  })

  it('falls back to system_name', () => {
    const out = transformContact({ id: 'con2', system_name: 'guest123' })
    expect(out.name).toBe('guest123')
  })

  it('sets platform=liveagent', () => {
    const out = transformContact({ id: 'con3' })
    expect(out.platform).toBe('liveagent')
  })

  it('does not throw on empty input', () => {
    expect(() => transformContact({})).not.toThrow()
  })
})

describe('LiveAgent transformUser', () => {
  it('maps agent role', () => {
    const out = transformUser({ id: 'u1', name: 'Bob', email: 'bob@co.com', role: 'R' })
    expect(out.role).toBe('agent')
    expect(out.platform).toBe('liveagent')
  })

  it('maps admin role', () => {
    const out = transformUser({ id: 'u2', role: 'A' })
    expect(out.role).toBe('admin')
  })

  it('does not throw on empty input', () => {
    expect(() => transformUser({})).not.toThrow()
  })
})

describe('LiveAgent transformTeam', () => {
  it('maps department_id as canonical id', () => {
    const out = transformTeam({ department_id: 'dep1', name: 'Support' })
    expect(out.id).toBe('dep1')
    expect(out.platform).toBe('liveagent')
  })

  it('falls back to id field', () => {
    const out = transformTeam({ id: 'dep2', name: 'Sales' })
    expect(out.id).toBe('dep2')
  })

  it('does not throw on empty input', () => {
    expect(() => transformTeam({})).not.toThrow()
  })
})

describe('LiveAgent transformMacro', () => {
  it('maps canned message fields', () => {
    const out = transformMacro({ id: 'm1', keywords: 'greeting', messagetext: 'Hello!' })
    expect(out.id).toBe('m1')
    expect(out.title).toBe('greeting')
    expect(out.body).toBe('Hello!')
    expect(out.platform).toBe('liveagent')
  })

  it('does not throw on empty input', () => {
    expect(() => transformMacro({})).not.toThrow()
  })
})

describe('LiveAgent transformMessageGroup', () => {
  it('flattens nested messages', () => {
    const group = {
      id: 'g1',
      userid: 'u1',
      datecreated: '2026-01-01T00:00:00Z',
      messages: [
        { id: 'msg1', userid: 'u1', type: 'MESSAGE', datecreated: '2026-01-01T00:00:00Z', message: 'Hi' },
        { id: 'msg2', userid: 'u1', type: 'INTERNAL', datecreated: '2026-01-01T01:00:00Z', message: 'note' },
      ],
    }
    const out = transformMessageGroup(group, 'ticket1')
    expect(out).toHaveLength(2)
    expect(out[0]!.id).toBe('msg1')
    expect(out[1]!.type).toBe('internal')
  })

  it('falls back when messages array is absent', () => {
    const group = { id: 'g2', userid: 'u1', datecreated: '2026-01-01T00:00:00Z' }
    const out = transformMessageGroup(group, 'ticket2')
    expect(out).toHaveLength(1)
    expect(out[0]!.ticketId).toBe('ticket2')
  })

  it('does not throw on empty group', () => {
    expect(() => transformMessageGroup({}, 'ticket3')).not.toThrow()
  })
})
