import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/kayako/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/kayako/transform/message'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/kayako/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/kayako/transform/user'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/kayako/transform/team'
import { transformMacro } from '../../../../../src/verticals/customer-support/adapters/kayako/transform/macro'

describe('Kayako transformTicket', () => {
  it('maps a completed case to resolved status', () => {
    const out = transformTicket({
      id: 101,
      subject: 'Cannot login',
      status: { label: 'Completed' },
      priority: { label: 'High' },
      source_channel: 'MAIL',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    } as any)
    expect(out.id).toBe('101')
    expect(out.platform).toBe('kayako')
    expect(out.status).toBe('resolved')
    expect(out.priority).toBe('high')
    expect(out.channel).toBe('email')
    expect(out.createdAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('maps an open case', () => {
    const out = transformTicket({ id: 202, subject: 'Billing question', status: 'OPEN' } as any)
    expect(out.status).toBe('open')
    expect(out.subject).toBe('Billing question')
  })

  it('maps is_closed=true to closed', () => {
    const out = transformTicket({ id: 303, is_closed: true } as any)
    expect(out.status).toBe('closed')
  })

  it('handles missing fields without throwing', () => {
    const out = transformTicket({ id: 404 } as any)
    expect(out.id).toBe('404')
    expect(out.platform).toBe('kayako')
  })
})

describe('Kayako transformMessage', () => {
  it('maps a requester post to authorType=contact', () => {
    const out = transformMessage(
      { id: 1, contents: 'Hello', is_requester: true, creator: { id: 9 }, resource_type: 'post' } as any,
      'case-1',
    )
    expect(out.authorType).toBe('contact')
    expect(out.type).toBe('public')
    expect(out.body).toBe('Hello')
    expect(out.platform).toBe('kayako')
  })

  it('maps an agent post to authorType=user', () => {
    const out = transformMessage(
      { id: 2, contents: 'Agent reply', is_requester: false, creator: { id: 7 }, resource_type: 'post' } as any,
      'case-1',
    )
    expect(out.authorType).toBe('user')
  })

  it('maps a note to type=internal', () => {
    const out = transformMessage(
      { id: 3, body_text: 'Internal note', user: { id: 5 }, resource_type: 'note' } as any,
      'case-2',
    )
    expect(out.type).toBe('internal')
    expect(out.body).toBe('Internal note')
  })

  it('handles missing body without throwing', () => {
    const out = transformMessage({ id: 4, resource_type: 'post' } as any, 'case-3')
    expect(out.id).toBe('4')
    expect(out.body).toBe('')
  })
})

describe('Kayako transformContact', () => {
  it('maps primary email and phone', () => {
    const out = transformContact({
      id: 10,
      full_name: 'Jane Doe',
      emails: [{ address: 'jane@example.com', is_primary: true }],
      phones: [{ number: '+15550001111', is_primary: true }],
    } as any)
    expect(out.id).toBe('10')
    expect(out.name).toBe('Jane Doe')
    expect(out.email).toBe('jane@example.com')
    expect(out.phone).toBe('+15550001111')
    expect(out.platform).toBe('kayako')
  })

  it('handles missing contact fields without throwing', () => {
    const out = transformContact({ id: 99 } as any)
    expect(out.id).toBe('99')
    expect(out.name).toBe('')
  })
})

describe('Kayako transformUser', () => {
  it('maps agent fields', () => {
    const out = transformUser({
      id: 20,
      full_name: 'Support Agent',
      emails: [{ address: 'agent@example.com', is_primary: true }],
      role: { label: 'AGENT' },
      teams: [{ id: 3 }],
    } as any)
    expect(out.id).toBe('20')
    expect(out.email).toBe('agent@example.com')
    expect(out.role).toBe('AGENT')
    expect(out.teamIds).toEqual(['3'])
    expect(out.platform).toBe('kayako')
  })
})

describe('Kayako transformTeam', () => {
  it('maps team fields', () => {
    const out = transformTeam({ id: 5, title: 'Level 2', member_count: 8 } as any)
    expect(out.id).toBe('5')
    expect(out.name).toBe('Level 2')
    expect(out.platform).toBe('kayako')
  })
})

describe('Kayako transformMacro', () => {
  it('maps macro fields', () => {
    const out = transformMacro({
      id: 7,
      title: 'Password reset',
      reply_contents: 'Please reset your password here.',
      reply_type: 'REPLY',
      visibility: 'PUBLIC',
    } as any)
    expect(out.id).toBe('7')
    expect(out.title).toBe('Password reset')
    expect(out.body).toBe('Please reset your password here.')
    expect(out.platform).toBe('kayako')
  })
})
