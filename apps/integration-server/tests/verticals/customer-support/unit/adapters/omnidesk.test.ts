import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/omnidesk/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/omnidesk/transform/message'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/omnidesk/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/omnidesk/transform/user'
import { transformTag } from '../../../../../src/verticals/customer-support/adapters/omnidesk/transform/tag'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/omnidesk/transform/team'

// ---------------------------------------------------------------------------
// transformTicket
// ---------------------------------------------------------------------------

describe('Omnidesk transformTicket', () => {
  it('maps id and externalId', () => {
    const out = transformTicket({ case_id: 42 })
    expect(out.id).toBe('42')
    expect(out.externalId).toBe('42')
  })

  it('platform is always omnidesk', () => {
    const out = transformTicket({ case_id: 1 })
    expect(out.platform).toBe('omnidesk')
  })

  it('maps status open', () => {
    const out = transformTicket({ case_id: 1, status: 'open' })
    expect(out.status).toBe('open')
  })

  it('maps status waiting → pending', () => {
    const out = transformTicket({ case_id: 2, status: 'waiting' })
    expect(out.status).toBe('pending')
  })

  it('maps status closed → closed', () => {
    const out = transformTicket({ case_id: 3, status: 'closed' })
    expect(out.status).toBe('closed')
  })

  it('sets closedAt when status is closed', () => {
    const out = transformTicket({
      case_id: 4,
      status: 'closed',
      closed_at: '2026-03-01T10:00:00Z',
    })
    expect(out.closedAt).toBe('2026-03-01T10:00:00.000Z')
  })

  it('sets closedAt via updated_at when closed_at is absent and status is closed', () => {
    const out = transformTicket({
      case_id: 5,
      status: 'closed',
      updated_at: '2026-03-02T12:00:00Z',
    })
    expect(out.closedAt).toBe('2026-03-02T12:00:00.000Z')
  })

  it('does not set closedAt when status is open', () => {
    const out = transformTicket({
      case_id: 6,
      status: 'open',
      closed_at: '2026-03-01T10:00:00Z',
    })
    expect(out.closedAt).toBeUndefined()
  })

  it('sets resolvedAt when status is closed', () => {
    const out = transformTicket({
      case_id: 7,
      status: 'closed',
      closed_at: '2026-03-01T10:00:00Z',
    })
    expect(out.resolvedAt).toBe('2026-03-01T10:00:00.000Z')
  })

  it('maps priority low', () => {
    const out = transformTicket({ case_id: 10, priority: 'low' })
    expect(out.priority).toBe('low')
  })

  it('maps priority normal', () => {
    const out = transformTicket({ case_id: 11, priority: 'normal' })
    expect(out.priority).toBe('normal')
  })

  it('maps priority high', () => {
    const out = transformTicket({ case_id: 12, priority: 'high' })
    expect(out.priority).toBe('high')
  })

  it('maps priority critical → urgent', () => {
    const out = transformTicket({ case_id: 13, priority: 'critical' })
    expect(out.priority).toBe('urgent')
  })

  it('returns undefined priority when unknown', () => {
    const out = transformTicket({ case_id: 14, priority: 'unknown' })
    expect(out.priority).toBeUndefined()
  })

  it('maps channel email', () => {
    const out = transformTicket({ case_id: 20, channel: 'email' })
    expect(out.channel).toBe('email')
  })

  it('maps channel chat', () => {
    const out = transformTicket({ case_id: 21, channel: 'chat' })
    expect(out.channel).toBe('chat')
  })

  it('maps channel call → voice', () => {
    const out = transformTicket({ case_id: 22, channel: 'call' })
    expect(out.channel).toBe('voice')
  })

  it('maps channel facebook → social', () => {
    const out = transformTicket({ case_id: 23, channel: 'facebook' })
    expect(out.channel).toBe('social')
  })

  it('maps channel telegram → social', () => {
    const out = transformTicket({ case_id: 24, channel: 'telegram' })
    expect(out.channel).toBe('social')
  })

  it('maps channel whatsapp → social', () => {
    const out = transformTicket({ case_id: 25, channel: 'whatsapp' })
    expect(out.channel).toBe('social')
  })

  it('maps channel web → web', () => {
    const out = transformTicket({ case_id: 26, channel: 'web' })
    expect(out.channel).toBe('web')
  })

  it('maps unknown channel → other', () => {
    const out = transformTicket({ case_id: 27, channel: 'custom_channel' })
    expect(out.channel).toBe('other')
  })

  it('maps requesterId from user_id', () => {
    const out = transformTicket({ case_id: 30, user_id: 99 })
    expect(out.requesterId).toBe('99')
  })

  it('maps assigneeId from staff_id', () => {
    const out = transformTicket({ case_id: 31, staff_id: 7 })
    expect(out.assigneeId).toBe('7')
  })

  it('maps teamId from group_id', () => {
    const out = transformTicket({ case_id: 32, group_id: 3 })
    expect(out.teamId).toBe('3')
  })

  it('maps tagIds from labels array', () => {
    const out = transformTicket({ case_id: 33, labels: [10, 11, 12] })
    expect(out.tagIds).toEqual(['10', '11', '12'])
  })

  it('tagIds defaults to empty array when labels absent', () => {
    const out = transformTicket({ case_id: 34 })
    expect(Array.isArray(out.tagIds)).toBe(true)
    expect(out.tagIds).toEqual([])
  })

  it('maps satisfactionRating: high → 5', () => {
    const out = transformTicket({ case_id: 40, rating: 'high' })
    expect(out.satisfactionRating).toBe(5)
  })

  it('maps satisfactionRating: middle → 3', () => {
    const out = transformTicket({ case_id: 41, rating: 'middle' })
    expect(out.satisfactionRating).toBe(3)
  })

  it('maps satisfactionRating: low → 1', () => {
    const out = transformTicket({ case_id: 42, rating: 'low' })
    expect(out.satisfactionRating).toBe(1)
  })

  it('maps satisfactionRating: absent → undefined', () => {
    const out = transformTicket({ case_id: 43 })
    expect(out.satisfactionRating).toBeUndefined()
  })

  it('createdAt is ISO-8601', () => {
    const out = transformTicket({ case_id: 50, created_at: '2026-01-01T00:00:00Z' })
    expect(out.createdAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('parentTicketId maps from parent_case_id', () => {
    const out = transformTicket({ case_id: 51, parent_case_id: 100 })
    expect(out.parentTicketId).toBe('100')
  })

  it('raw is preserved', () => {
    const raw = { case_id: 99, subject: 'raw check' }
    const out = transformTicket(raw)
    expect(out.raw).toBe(raw)
  })

  it('does not throw on minimal input', () => {
    expect(() => transformTicket({ case_id: 0 })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformMessage — authorType mapping
// ---------------------------------------------------------------------------

describe('Omnidesk transformMessage authorType', () => {
  it('maps staff_id present → authorType=user (staff/agent)', () => {
    const out = transformMessage({ message_id: 1, staff_id: 5 }, 'tkt-1')
    expect(out.authorType).toBe('user')
  })

  it('maps user_id only → authorType=contact (customer)', () => {
    const out = transformMessage({ message_id: 2, user_id: 99 }, 'tkt-1')
    expect(out.authorType).toBe('contact')
  })

  it('maps neither staff_id nor user_id → authorType=contact', () => {
    const out = transformMessage({ message_id: 3 }, 'tkt-1')
    expect(out.authorType).toBe('contact')
  })

  it('uses staff_id as authorId when staff', () => {
    const out = transformMessage({ message_id: 4, staff_id: 7 }, 'tkt-2')
    expect(out.authorId).toBe('7')
  })

  it('uses user_id as authorId when contact', () => {
    const out = transformMessage({ message_id: 5, user_id: 42 }, 'tkt-2')
    expect(out.authorId).toBe('42')
  })

  it('maps note=true → type=internal', () => {
    const out = transformMessage({ message_id: 6, note: true }, 'tkt-3')
    expect(out.type).toBe('internal')
  })

  it('maps note=false → type=public', () => {
    const out = transformMessage({ message_id: 7, note: false }, 'tkt-3')
    expect(out.type).toBe('public')
  })

  it('maps note absent → type=public', () => {
    const out = transformMessage({ message_id: 8 }, 'tkt-3')
    expect(out.type).toBe('public')
  })

  it('maps content to body', () => {
    const out = transformMessage({ message_id: 9, content: 'Hello!' }, 'tkt-4')
    expect(out.body).toBe('Hello!')
  })

  it('maps attachmentCount from attachments array length', () => {
    const out = transformMessage(
      { message_id: 10, attachments: [{ file_id: 1 }, { file_id: 2 }] },
      'tkt-5',
    )
    expect(out.attachmentCount).toBe(2)
  })

  it('platform is always omnidesk', () => {
    const out = transformMessage({ message_id: 11 }, 'tkt-6')
    expect(out.platform).toBe('omnidesk')
  })

  it('ticketId is passed through', () => {
    const out = transformMessage({ message_id: 12 }, 'ticket-99')
    expect(out.ticketId).toBe('ticket-99')
  })

  it('createdAt is ISO-8601 from created_at', () => {
    const out = transformMessage({ message_id: 13, created_at: '2026-04-01T08:00:00Z' }, 'tkt-7')
    expect(out.createdAt).toBe('2026-04-01T08:00:00.000Z')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformMessage({ message_id: 0 }, 'tkt-min')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformContact
// ---------------------------------------------------------------------------

describe('Omnidesk transformContact', () => {
  it('maps id, email, name', () => {
    const out = transformContact({
      user_id: 100,
      user_full_name: 'Jane Doe',
      user_email: 'jane@example.com',
    })
    expect(out.id).toBe('100')
    expect(out.email).toBe('jane@example.com')
    expect(out.name).toBe('Jane Doe')
    expect(out.platform).toBe('omnidesk')
  })

  it('maps phone from user_phone', () => {
    const out = transformContact({ user_id: 101, user_phone: '+1234567890' })
    expect(out.phone).toBe('+1234567890')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformContact({ user_id: 0 })).not.toThrow()
  })

  it('raw is preserved', () => {
    const raw = { user_id: 102, user_email: 'test@x.com' }
    const out = transformContact(raw)
    expect(out.raw).toBe(raw)
  })
})

// ---------------------------------------------------------------------------
// transformUser (staff)
// ---------------------------------------------------------------------------

describe('Omnidesk transformUser', () => {
  it('maps id, email, name', () => {
    const out = transformUser({
      staff_id: 200,
      staff_email: 'agent@example.com',
      staff_full_name: 'Alice Agent',
    })
    expect(out.id).toBe('200')
    expect(out.email).toBe('agent@example.com')
    expect(out.name).toBe('Alice Agent')
    expect(out.platform).toBe('omnidesk')
  })

  it('maps role from role_id', () => {
    const out = transformUser({ staff_id: 201, role_id: 3 })
    expect(out.role).toBe('3')
  })

  it('returns empty teamIds array', () => {
    const out = transformUser({ staff_id: 202 })
    expect(Array.isArray(out.teamIds)).toBe(true)
    expect(out.teamIds).toEqual([])
  })

  it('does not throw on minimal input', () => {
    expect(() => transformUser({ staff_id: 0 })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformTag (label)
// ---------------------------------------------------------------------------

describe('Omnidesk transformTag', () => {
  it('maps id and name', () => {
    const out = transformTag({ label_id: 300, label_title: 'billing' })
    expect(out.id).toBe('300')
    expect(out.name).toBe('billing')
    expect(out.platform).toBe('omnidesk')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformTag({ label_id: 0 })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformTeam (group)
// ---------------------------------------------------------------------------

describe('Omnidesk transformTeam', () => {
  it('maps id and name', () => {
    const out = transformTeam({ group_id: 400, group_title: 'Support' })
    expect(out.id).toBe('400')
    expect(out.name).toBe('Support')
    expect(out.platform).toBe('omnidesk')
  })

  it('maps fromName metadata', () => {
    const out = transformTeam({ group_id: 401, group_title: 'L2', group_from_name: 'L2 Team' })
    expect(out.metadata['fromName']).toBe('L2 Team')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformTeam({ group_id: 0 })).not.toThrow()
  })

  it('raw is preserved', () => {
    const raw = { group_id: 402, group_title: 'raw check' }
    const out = transformTeam(raw)
    expect(out.raw).toBe(raw)
  })
})
