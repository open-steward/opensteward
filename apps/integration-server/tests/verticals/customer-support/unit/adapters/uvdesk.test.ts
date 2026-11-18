import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/uvdesk/transform/ticket'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/uvdesk/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/uvdesk/transform/user'
import { transformTag } from '../../../../../src/verticals/customer-support/adapters/uvdesk/transform/tag'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/uvdesk/transform/team'
import { transformMacro } from '../../../../../src/verticals/customer-support/adapters/uvdesk/transform/macro'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/uvdesk/transform/message'

describe('UVdesk transform — ticket', () => {
  it('maps an open ticket with all fields', () => {
    const out = transformTicket({
      id: 101,
      incrementId: 5,
      subject: 'Test subject',
      status: { id: 1, description: 'Open' },
      priority: { id: 2, description: 'High' },
      source: 'email',
      customer: { id: 42, email: 'c@example.com', name: 'Customer' },
      agent: { id: 7, email: 'a@example.com', name: 'Agent' },
      group: { id: 3, name: 'Support' },
      tags: [{ id: 10, name: 'billing' }],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      totalThreads: 3,
    })
    expect(out.id).toBe('101')
    expect(out.platform).toBe('uvdesk')
    expect(out.status).toBe('open')
    expect(out.priority).toBe('high')
    expect(out.channel).toBe('email')
    expect(out.number).toBe('5')
    expect(out.requesterId).toBe('42')
    expect(out.assigneeId).toBe('7')
    expect(out.teamId).toBe('3')
    expect(out.tagIds).toEqual(['10'])
    expect(out.createdAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('maps a resolved ticket and sets resolvedAt', () => {
    const out = transformTicket({
      id: 202,
      status: { id: 4, description: 'Resolved' },
      updatedAt: '2026-02-01T00:00:00Z',
    })
    expect(out.status).toBe('resolved')
    expect(out.resolvedAt).toBe('2026-02-01T00:00:00.000Z')
  })

  it('maps status=Answered to in_progress', () => {
    const out = transformTicket({ id: 303, status: { id: 3, description: 'Answered' } })
    expect(out.status).toBe('in_progress')
  })

  it('maps status=Spam to closed', () => {
    const out = transformTicket({ id: 404, status: { id: 6, description: 'Spam' } })
    expect(out.status).toBe('closed')
  })

  it('handles string status and priority', () => {
    const out = transformTicket({ id: 505, status: 'pending', priority: 'urgent' })
    expect(out.status).toBe('pending')
    expect(out.priority).toBe('urgent')
  })

  it('maps source=website to channel=web', () => {
    const out = transformTicket({ id: 606, source: 'website' })
    expect(out.channel).toBe('web')
  })

  it('maps source=api to channel=api', () => {
    const out = transformTicket({ id: 707, source: 'api' })
    expect(out.channel).toBe('api')
  })

  it('defaults unknown source to channel=other', () => {
    const out = transformTicket({ id: 808, source: 'fax' })
    expect(out.channel).toBe('other')
  })

  it('does not throw on empty input', () => {
    expect(() => transformTicket({})).not.toThrow()
  })
})

describe('UVdesk transform — contact', () => {
  it('maps a customer', () => {
    const out = transformContact({
      id: 1,
      email: 'user@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      contactNumber: '+15551234567',
      isActive: true,
    })
    expect(out.id).toBe('1')
    expect(out.platform).toBe('uvdesk')
    expect(out.email).toBe('user@example.com')
    expect(out.name).toBe('Jane Doe')
    expect(out.phone).toBe('+15551234567')
  })

  it('prefers name over firstName+lastName', () => {
    const out = transformContact({ id: 2, name: 'Full Name', firstName: 'Full', lastName: 'Name' })
    expect(out.name).toBe('Full Name')
  })

  it('does not throw on empty input', () => {
    expect(() => transformContact({})).not.toThrow()
  })
})

describe('UVdesk transform — user', () => {
  it('maps a member', () => {
    const out = transformUser({
      id: 9,
      email: 'agent@example.com',
      firstName: 'Support',
      lastName: 'Agent',
      role: 'ROLE_AGENT',
      isActive: true,
    })
    expect(out.id).toBe('9')
    expect(out.platform).toBe('uvdesk')
    expect(out.email).toBe('agent@example.com')
    expect(out.role).toBe('ROLE_AGENT')
    expect(out.teamIds).toEqual([])
  })

  it('does not throw on empty input', () => {
    expect(() => transformUser({})).not.toThrow()
  })
})

describe('UVdesk transform — tag', () => {
  it('maps a tag', () => {
    const out = transformTag({ id: 55, name: 'billing' })
    expect(out.id).toBe('55')
    expect(out.name).toBe('billing')
    expect(out.platform).toBe('uvdesk')
  })

  it('falls back to name as id when id absent', () => {
    const out = transformTag({ name: 'urgent' })
    expect(out.id).toBe('urgent')
  })

  it('does not throw on empty input', () => {
    expect(() => transformTag({})).not.toThrow()
  })
})

describe('UVdesk transform — team', () => {
  it('maps a group', () => {
    const out = transformTeam({ id: 3, name: 'Tier 1', description: 'Front-line', isActive: true })
    expect(out.id).toBe('3')
    expect(out.name).toBe('Tier 1')
    expect(out.platform).toBe('uvdesk')
    expect(out.metadata['description']).toBe('Front-line')
  })

  it('does not throw on empty input', () => {
    expect(() => transformTeam({})).not.toThrow()
  })
})

describe('UVdesk transform — macro (saved reply)', () => {
  it('maps a saved reply', () => {
    const out = transformMacro({ id: 7, name: 'Greeting', message: 'Hello, how can I help?', templateFor: 'greeting' })
    expect(out.id).toBe('7')
    expect(out.title).toBe('Greeting')
    expect(out.body).toBe('Hello, how can I help?')
    expect(out.category).toBe('greeting')
    expect(out.platform).toBe('uvdesk')
  })

  it('strips HTML from message', () => {
    const out = transformMacro({ id: 8, name: 'HTML reply', message: '<p>Hello &amp; welcome</p>' })
    expect(out.body).toBe('Hello & welcome')
  })

  it('does not throw on empty input', () => {
    expect(() => transformMacro({})).not.toThrow()
  })
})

describe('UVdesk transform — message (thread)', () => {
  it('maps a reply thread', () => {
    const out = transformMessage(
      {
        id: 15,
        reply: 'This is my answer',
        threadType: 'reply',
        userType: 'agent',
        createdAt: '2026-03-01T00:00:00Z',
        user: { id: 7, email: 'agent@example.com', name: 'Agent' },
        attachments: [{ id: 1, name: 'file.pdf' }],
      },
      'ticket-101',
    )
    expect(out.id).toBe('15')
    expect(out.ticketId).toBe('ticket-101')
    expect(out.authorId).toBe('7')
    expect(out.authorType).toBe('user')
    expect(out.type).toBe('public')
    expect(out.body).toBe('This is my answer')
    expect(out.attachmentCount).toBe(1)
    expect(out.platform).toBe('uvdesk')
  })

  it('maps threadType=note to internal', () => {
    const out = transformMessage({ id: 16, threadType: 'note', userType: 'agent' }, 'ticket-102')
    expect(out.type).toBe('internal')
  })

  it('maps userType=customer to authorType=contact', () => {
    const out = transformMessage({ id: 17, userType: 'customer' }, 'ticket-103')
    expect(out.authorType).toBe('contact')
  })

  it('does not throw on empty input', () => {
    expect(() => transformMessage({}, 'ticket-0')).not.toThrow()
  })
})
