import { describe, it, expect } from 'vitest'
import { transformTag } from '../../../../../src/verticals/customer-support/adapters/tiledesk/transform/tag'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/tiledesk/transform/ticket'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/tiledesk/transform/contact'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/tiledesk/transform/message'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/tiledesk/transform/user'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/tiledesk/transform/team'
import { transformMacro } from '../../../../../src/verticals/customer-support/adapters/tiledesk/transform/macro'

describe('Tiledesk transformTag', () => {
  it('sets color at top-level canonical field', () => {
    const out = transformTag({ _id: 'tag1', tag: 'billing', color: '#e53935' })
    expect(out.color).toBe('#e53935')
    expect(out.platform).toBe('tiledesk')
  })

  it('handles null color without throwing', () => {
    const out = transformTag({ _id: 'tag2', tag: 'sales', color: null })
    expect(out.color).toBeUndefined()
    expect(out.name).toBe('sales')
  })

  it('falls back to tag name when _id is missing', () => {
    const out = transformTag({ tag: 'support' })
    expect(out.id).toBe('support')
    expect(out.externalId).toBe('support')
  })

  it('does not throw on empty input', () => {
    expect(() => transformTag({})).not.toThrow()
  })
})

describe('Tiledesk transformTicket', () => {
  it('maps status 100 → open', () => {
    const out = transformTicket({ _id: 'req1', status: 100, createdAt: '2026-01-01T00:00:00Z' })
    expect(out.status).toBe('open')
    expect(out.platform).toBe('tiledesk')
  })

  it('maps status 200 → in_progress', () => {
    const out = transformTicket({ _id: 'req2', status: 200, createdAt: '2026-01-01T00:00:00Z' })
    expect(out.status).toBe('in_progress')
  })

  it('maps status 1000 → closed', () => {
    const out = transformTicket({ _id: 'req3', status: 1000, createdAt: '2026-01-01T00:00:00Z' })
    expect(out.status).toBe('closed')
  })

  it('maps channel chat21 → chat', () => {
    const out = transformTicket({ _id: 'req4', status: 100, channel: { name: 'chat21' }, createdAt: '2026-01-01T00:00:00Z' })
    expect(out.channel).toBe('chat')
  })

  it('maps channel email → email', () => {
    const out = transformTicket({ _id: 'req5', status: 100, channel: { name: 'email' }, createdAt: '2026-01-01T00:00:00Z' })
    expect(out.channel).toBe('email')
  })

  it('createdAt is ISO-8601', () => {
    const out = transformTicket({ _id: 'req6', status: 100, createdAt: '2026-03-15T10:00:00Z' })
    expect(out.createdAt).toBe('2026-03-15T10:00:00.000Z')
  })

  it('does not throw on empty input', () => {
    expect(() => transformTicket({})).not.toThrow()
  })
})

describe('Tiledesk transformContact', () => {
  it('maps lead fields correctly', () => {
    const out = transformContact({
      _id: 'lead1',
      fullname: 'Alice Smith',
      email: 'alice@example.com',
      phone: '+15551234567',
    })
    expect(out.id).toBe('lead1')
    expect(out.name).toBe('Alice Smith')
    expect(out.email).toBe('alice@example.com')
    expect(out.phone).toBe('+15551234567')
    expect(out.platform).toBe('tiledesk')
  })

  it('does not throw on empty input', () => {
    expect(() => transformContact({})).not.toThrow()
  })
})

describe('Tiledesk transformMessage', () => {
  it('maps text message correctly', () => {
    const out = transformMessage(
      { _id: 'msg1', sender: 'agent@example.com', text: 'Hello!', createdAt: '2026-01-01T00:00:00Z' },
      'ticket1',
    )
    expect(out.id).toBe('msg1')
    expect(out.body).toBe('Hello!')
    expect(out.platform).toBe('tiledesk')
    expect(out.type).toBe('public')
  })

  it('detects bot sender as system author', () => {
    const out = transformMessage(
      { _id: 'msg2', sender: 'bot_assistant', text: 'Hi!', createdAt: '2026-01-01T00:00:00Z' },
      'ticket1',
    )
    expect(out.authorType).toBe('system')
  })

  it('uses ticketId fallback when recipient is missing', () => {
    const out = transformMessage(
      { _id: 'msg3', text: 'test', createdAt: '2026-01-01T00:00:00Z' },
      'fallback-ticket',
    )
    expect(out.ticketId).toBe('fallback-ticket')
  })

  it('does not throw on empty input', () => {
    expect(() => transformMessage({}, 'tid')).not.toThrow()
  })
})

describe('Tiledesk transformUser', () => {
  it('maps project_user correctly', () => {
    const out = transformUser({
      _id: 'pu1',
      id_user: { _id: 'u1', email: 'bob@example.com', firstname: 'Bob', lastname: 'Jones' },
      role: 'agent',
    })
    expect(out.id).toBe('u1')
    expect(out.email).toBe('bob@example.com')
    expect(out.name).toBe('Bob Jones')
    expect(out.role).toBe('agent')
    expect(out.platform).toBe('tiledesk')
  })

  it('does not throw on empty input', () => {
    expect(() => transformUser({})).not.toThrow()
  })
})

describe('Tiledesk transformTeam', () => {
  it('maps department correctly', () => {
    const out = transformTeam({ _id: 'dept1', name: 'Sales' })
    expect(out.id).toBe('dept1')
    expect(out.name).toBe('Sales')
    expect(out.platform).toBe('tiledesk')
  })

  it('does not throw on empty input', () => {
    expect(() => transformTeam({})).not.toThrow()
  })
})

describe('Tiledesk transformMacro', () => {
  it('maps canned response correctly', () => {
    const out = transformMacro({ _id: 'canned1', title: 'Greeting', text: 'Welcome!' })
    expect(out.id).toBe('canned1')
    expect(out.title).toBe('Greeting')
    expect(out.body).toBe('Welcome!')
    expect(out.platform).toBe('tiledesk')
  })

  it('does not throw on empty input', () => {
    expect(() => transformMacro({})).not.toThrow()
  })
})
