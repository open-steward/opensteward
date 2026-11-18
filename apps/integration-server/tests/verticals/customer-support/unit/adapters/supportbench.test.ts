import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/supportbench/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/supportbench/transform/message'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/supportbench/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/supportbench/transform/user'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/supportbench/transform/team'
import { transformTag, tagFromString } from '../../../../../src/verticals/customer-support/adapters/supportbench/transform/tag'

// ---------------------------------------------------------------------------
// transformTicket
// ---------------------------------------------------------------------------

describe('Supportbench transformTicket', () => {
  it('builds composite id from id_prefix + id', () => {
    const out = transformTicket({ id_prefix: 'C', id: '1042', subject: 'Login broken' })
    expect(out.id).toBe('C-1042')
    expect(out.externalId).toBe('C-1042')
    expect(out.number).toBe('1042')
  })

  it('uses bare id when no id_prefix', () => {
    const out = transformTicket({ id: '99', subject: 'Test' })
    expect(out.id).toBe('99')
    expect(out.number).toBe('99')
  })

  it('maps status: open', () => {
    const out = transformTicket({ id: '1', status: 'Open' })
    expect(out.status).toBe('open')
  })

  it('maps status: new → open', () => {
    const out = transformTicket({ id: '2', status: 'New' })
    expect(out.status).toBe('open')
  })

  it('maps status: pending', () => {
    const out = transformTicket({ id: '3', status: 'Pending' })
    expect(out.status).toBe('pending')
  })

  it('maps status: on_hold', () => {
    const out = transformTicket({ id: '4', status: 'On Hold' })
    expect(out.status).toBe('on_hold')
  })

  it('maps status: resolved', () => {
    const out = transformTicket({ id: '5', status: 'Resolved' })
    expect(out.status).toBe('resolved')
  })

  it('maps status: closed', () => {
    const out = transformTicket({ id: '6', status: 'Closed' })
    expect(out.status).toBe('closed')
  })

  it('defaults to open when status is unknown', () => {
    const out = transformTicket({ id: '7', status: 'WeirdCustomStatus' })
    expect(out.status).toBe('open')
  })

  it('maps priority: low', () => {
    const out = transformTicket({ id: '10', priority: 'Low' })
    expect(out.priority).toBe('low')
  })

  it('maps priority: normal', () => {
    const out = transformTicket({ id: '11', priority: 'Normal' })
    expect(out.priority).toBe('normal')
  })

  it('maps priority: high', () => {
    const out = transformTicket({ id: '12', priority: 'High' })
    expect(out.priority).toBe('high')
  })

  it('maps priority: urgent from "Urgent"', () => {
    const out = transformTicket({ id: '13', priority: 'Urgent' })
    expect(out.priority).toBe('urgent')
  })

  it('maps priority: urgent from "Critical"', () => {
    const out = transformTicket({ id: '14', priority: 'Critical' })
    expect(out.priority).toBe('urgent')
  })

  it('returns undefined priority for unknown value', () => {
    const out = transformTicket({ id: '15', priority: 'Banana' })
    expect(out.priority).toBeUndefined()
  })

  it('channel is always other', () => {
    const out = transformTicket({ id: '20' })
    expect(out.channel).toBe('other')
  })

  it('maps requesterId from contact_id', () => {
    const out = transformTicket({ id: '21', contact_id: 'c-99' })
    expect(out.requesterId).toBe('c-99')
  })

  it('maps assigneeId from owner_id', () => {
    const out = transformTicket({ id: '22', owner_id: 'u-5' })
    expect(out.assigneeId).toBe('u-5')
  })

  it('maps teamId from division_id', () => {
    const out = transformTicket({ id: '23', division_id: 7 })
    expect(out.teamId).toBe('7')
  })

  it('maps tags array', () => {
    const out = transformTicket({ id: '24', tags: ['billing', 'vip'] })
    expect(out.tagIds).toEqual(['billing', 'vip'])
  })

  it('tagIds defaults to empty array when absent', () => {
    const out = transformTicket({ id: '25' })
    expect(out.tagIds).toEqual([])
  })

  it('normalises sat_score from 1-10 scale to 1-5', () => {
    const out = transformTicket({ id: '26', sat_score: 10 })
    expect(out.satisfactionRating).toBe(5)
  })

  it('sat_score 5 → 3 (rounds 2.5)', () => {
    const out = transformTicket({ id: '27', sat_score: 5 })
    // Math.round(5/2) = 3
    expect(out.satisfactionRating).toBe(3)
  })

  it('createdAt is an ISO-8601 string', () => {
    const out = transformTicket({ id: '28', created: '2026-01-15T09:30:00Z' })
    expect(out.createdAt).toBe('2026-01-15T09:30:00.000Z')
  })

  it('updatedAt is an ISO-8601 string', () => {
    const out = transformTicket({ id: '29', modified: '2026-02-01T12:00:00Z' })
    expect(out.updatedAt).toBe('2026-02-01T12:00:00.000Z')
  })

  it('resolvedAt set when status is resolved', () => {
    const out = transformTicket({ id: '30', status: 'Resolved', closed: '2026-03-01T00:00:00Z' })
    expect(out.resolvedAt).toBe('2026-03-01T00:00:00.000Z')
  })

  it('closedAt set from closed field', () => {
    const out = transformTicket({ id: '31', status: 'Closed', closed: '2026-03-15T00:00:00Z' })
    expect(out.closedAt).toBe('2026-03-15T00:00:00.000Z')
  })

  it('platform is always supportbench', () => {
    const out = transformTicket({ id: '32' })
    expect(out.platform).toBe('supportbench')
  })

  it('raw is preserved', () => {
    const raw = { id: '33', subject: 'raw check' }
    const out = transformTicket(raw)
    expect(out.raw).toBe(raw)
  })

  it('does not throw on minimal input', () => {
    expect(() => transformTicket({})).not.toThrow()
  })

  it('does not throw on null/undefined field values', () => {
    expect(() => transformTicket({ id: null, status: null, priority: null, tags: undefined })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformMessage
// ---------------------------------------------------------------------------

describe('Supportbench transformMessage', () => {
  it('maps id and ticketId', () => {
    const out = transformMessage({ id: 100 }, 'C-1042')
    expect(out.id).toBe('100')
    expect(out.ticketId).toBe('C-1042')
  })

  it('maps authorType=user when createdby_id is set', () => {
    const out = transformMessage({ id: 101, createdby_id: 'u-5' }, 'C-1')
    expect(out.authorType).toBe('user')
    expect(out.authorId).toBe('u-5')
  })

  it('maps authorType=contact when createdby_id is absent', () => {
    const out = transformMessage({ id: 102, contact_id: 'c-9' }, 'C-1')
    expect(out.authorType).toBe('contact')
    expect(out.authorId).toBe('c-9')
  })

  it('maps type=internal when public is false', () => {
    const out = transformMessage({ id: 103, public: false }, 'C-1')
    expect(out.type).toBe('internal')
  })

  it('maps type=public when public is true', () => {
    const out = transformMessage({ id: 104, public: true }, 'C-1')
    expect(out.type).toBe('public')
  })

  it('prefers content_plain_text over content for body', () => {
    const out = transformMessage({ id: 105, content_plain_text: 'plain text', content: '<p>html</p>' }, 'C-1')
    expect(out.body).toBe('plain text')
  })

  it('falls back to content when plain text absent', () => {
    const out = transformMessage({ id: 106, content: '<p>html</p>' }, 'C-1')
    expect(out.body).toBe('<p>html</p>')
  })

  it('maps attachmentCount from attachments array length', () => {
    const out = transformMessage({ id: 107, attachments: [{ id: 1, name: 'file.pdf' }, { id: 2, name: 'image.png' }] }, 'C-1')
    expect(out.attachmentCount).toBe(2)
  })

  it('createdAt is an ISO-8601 string', () => {
    const out = transformMessage({ id: 108, created: '2026-04-01T10:00:00Z' }, 'C-1')
    expect(out.createdAt).toBe('2026-04-01T10:00:00.000Z')
  })

  it('platform is always supportbench', () => {
    const out = transformMessage({ id: 109 }, 'C-1')
    expect(out.platform).toBe('supportbench')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformMessage({}, 'C-min')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformContact
// ---------------------------------------------------------------------------

describe('Supportbench transformContact', () => {
  it('maps id, email, name', () => {
    const out = transformContact({ id: '200', name: 'Jane Doe', email: 'jane@example.com' })
    expect(out.id).toBe('200')
    expect(out.email).toBe('jane@example.com')
    expect(out.name).toBe('Jane Doe')
    expect(out.platform).toBe('supportbench')
  })

  it('maps organizationId from company_id', () => {
    const out = transformContact({ id: '201', company_id: 'org-5' })
    expect(out.organizationId).toBe('org-5')
  })

  it('maps phone', () => {
    const out = transformContact({ id: '202', phone: '+1-800-555-0100' })
    expect(out.phone).toBe('+1-800-555-0100')
  })

  it('includes support_level in metadata', () => {
    const out = transformContact({ id: '203', support_level: 'Gold' })
    expect(out.metadata['support_level']).toBe('Gold')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformContact({})).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformUser
// ---------------------------------------------------------------------------

describe('Supportbench transformUser', () => {
  it('maps id, email, name', () => {
    const out = transformUser({ id: '300', name: 'Alice Agent', email: 'alice@example.com' })
    expect(out.id).toBe('300')
    expect(out.email).toBe('alice@example.com')
    expect(out.name).toBe('Alice Agent')
    expect(out.platform).toBe('supportbench')
  })

  it('maps teamIds from division_id', () => {
    const out = transformUser({ id: '301', division_id: 4 })
    expect(out.teamIds).toEqual(['4'])
  })

  it('returns empty teamIds when division_id absent', () => {
    const out = transformUser({ id: '302' })
    expect(out.teamIds).toEqual([])
  })

  it('maps role', () => {
    const out = transformUser({ id: '303', role: 'Admin' })
    expect(out.role).toBe('Admin')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformUser({})).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformTeam
// ---------------------------------------------------------------------------

describe('Supportbench transformTeam', () => {
  it('maps id and name', () => {
    const out = transformTeam({ id: 400, name: 'Support Division' })
    expect(out.id).toBe('400')
    expect(out.name).toBe('Support Division')
    expect(out.platform).toBe('supportbench')
  })

  it('maps description in metadata', () => {
    const out = transformTeam({ id: 401, name: 'L2 Team', description: 'Level 2 support' })
    expect(out.metadata['description']).toBe('Level 2 support')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformTeam({})).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformTag / tagFromString
// ---------------------------------------------------------------------------

describe('Supportbench transformTag', () => {
  it('maps tag name to id and name', () => {
    const out = transformTag({ name: 'billing' })
    expect(out.id).toBe('billing')
    expect(out.externalId).toBe('billing')
    expect(out.name).toBe('billing')
    expect(out.platform).toBe('supportbench')
  })

  it('tagFromString creates a RawSupportbenchTag with given name', () => {
    const raw = tagFromString('urgent')
    expect(raw.name).toBe('urgent')
    const out = transformTag(raw)
    expect(out.name).toBe('urgent')
  })
})
