import { describe, it, expect } from 'vitest'
import { FrappeHelpdeskAdapter } from '../../../../../src/verticals/customer-support/adapters/frappe-helpdesk'
import { transformTicket, type RawFrappeTicket } from '../../../../../src/verticals/customer-support/adapters/frappe-helpdesk/transform/ticket'
import { transformMessage, type RawFrappeComment } from '../../../../../src/verticals/customer-support/adapters/frappe-helpdesk/transform/message'
import { transformContact, type RawFrappeCustomer } from '../../../../../src/verticals/customer-support/adapters/frappe-helpdesk/transform/contact'
import { transformUser, type RawFrappeAgent } from '../../../../../src/verticals/customer-support/adapters/frappe-helpdesk/transform/user'
import { transformTeam, type RawFrappeTeam } from '../../../../../src/verticals/customer-support/adapters/frappe-helpdesk/transform/team'
import { transformTag, type RawFrappePriority } from '../../../../../src/verticals/customer-support/adapters/frappe-helpdesk/transform/tag'
import { transformMacro, type RawFrappeSavedReply } from '../../../../../src/verticals/customer-support/adapters/frappe-helpdesk/transform/macro'

// ── Adapter construction ──────────────────────────────────────────────────────

describe('FrappeHelpdeskAdapter', () => {
  it('platform is frappe-helpdesk', () => {
    const adapter = new FrappeHelpdeskAdapter()
    expect(adapter.platform).toBe('frappe-helpdesk')
  })

  it('getMessage is not defined (removed)', () => {
    const adapter = new FrappeHelpdeskAdapter()
    expect('getMessage' in adapter).toBe(false)
  })

  it('credentialFields returns siteUrl, apiKey, apiSecret', () => {
    const fields = new FrappeHelpdeskAdapter().credentialFields()
    const names = fields.map((f) => f.name)
    expect(names).toContain('siteUrl')
    expect(names).toContain('apiKey')
    expect(names).toContain('apiSecret')
  })
})

// ── transformTicket ───────────────────────────────────────────────────────────

describe('transformTicket', () => {
  const raw: RawFrappeTicket = {
    name: 'HD-TICKET-00001',
    subject: 'Cannot log in',
    status: 'Open',
    priority: 'High',
    raised_by: 'user@example.com',
    contact: null,
    agent_group: 'Support Team',
    _assign: '["agent@example.com"]',
    creation: '2026-01-15 09:00:00',
    modified: '2026-01-20 12:00:00',
    resolution_date: null,
    feedback_rating: null,
    via_customer_portal: 1,
  }

  it('maps id and platform', () => {
    const t = transformTicket(raw)
    expect(t.id).toBe('HD-TICKET-00001')
    expect(t.platform).toBe('frappe-helpdesk')
  })

  it('maps open status', () => {
    expect(transformTicket(raw).status).toBe('open')
  })

  it('maps replied to pending', () => {
    expect(transformTicket({ ...raw, status: 'Replied' }).status).toBe('pending')
  })

  it('maps resolved status', () => {
    expect(transformTicket({ ...raw, status: 'Resolved' }).status).toBe('resolved')
  })

  it('maps closed status', () => {
    expect(transformTicket({ ...raw, status: 'Closed' }).status).toBe('closed')
  })

  it('defaults unknown status to open', () => {
    expect(transformTicket({ ...raw, status: 'Weird' }).status).toBe('open')
  })

  it('maps high priority', () => {
    expect(transformTicket(raw).priority).toBe('high')
  })

  it('maps medium priority to normal', () => {
    expect(transformTicket({ ...raw, priority: 'Medium' }).priority).toBe('normal')
  })

  it('maps urgent priority', () => {
    expect(transformTicket({ ...raw, priority: 'Urgent' }).priority).toBe('urgent')
  })

  it('maps low priority', () => {
    expect(transformTicket({ ...raw, priority: 'Low' }).priority).toBe('low')
  })

  it('maps channel to web when via_customer_portal truthy', () => {
    expect(transformTicket(raw).channel).toBe('web')
  })

  it('maps channel to other when via_customer_portal falsy', () => {
    expect(transformTicket({ ...raw, via_customer_portal: 0 }).channel).toBe('other')
  })

  it('maps requesterId from raised_by', () => {
    expect(transformTicket(raw).requesterId).toBe('user@example.com')
  })

  it('extracts first assignee from _assign JSON array', () => {
    expect(transformTicket(raw).assigneeId).toBe('agent@example.com')
  })

  it('returns undefined assigneeId when _assign is empty array', () => {
    expect(transformTicket({ ...raw, _assign: '[]' }).assigneeId).toBeUndefined()
  })

  it('returns undefined assigneeId when _assign is null', () => {
    expect(transformTicket({ ...raw, _assign: null }).assigneeId).toBeUndefined()
  })

  it('maps teamId from agent_group', () => {
    expect(transformTicket(raw).teamId).toBe('Support Team')
  })

  it('maps dates to ISO-8601', () => {
    const t = transformTicket(raw)
    expect(t.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(t.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('satisfactionRating is integer (Math.round applied)', () => {
    const t = transformTicket({ ...raw, feedback_rating: 3.7 })
    expect(t.satisfactionRating).toBe(4)
    expect(Number.isInteger(t.satisfactionRating)).toBe(true)
  })

  it('satisfactionRating rounds down when needed', () => {
    const t = transformTicket({ ...raw, feedback_rating: 4.2 })
    expect(t.satisfactionRating).toBe(4)
  })

  it('satisfactionRating is undefined when 0', () => {
    const t = transformTicket({ ...raw, feedback_rating: 0 })
    expect(t.satisfactionRating).toBeUndefined()
  })

  it('satisfactionRating is undefined when null', () => {
    const t = transformTicket({ ...raw, feedback_rating: null })
    expect(t.satisfactionRating).toBeUndefined()
  })

  it('sets resolvedAt when status is resolved', () => {
    const t = transformTicket({ ...raw, status: 'Resolved', resolution_date: '2026-02-01 10:00:00' })
    expect(t.resolvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('resolvedAt falls back to modified when resolution_date absent and status resolved', () => {
    const t = transformTicket({ ...raw, status: 'Resolved', resolution_date: null })
    expect(t.resolvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('resolvedAt is undefined when open', () => {
    expect(transformTicket(raw).resolvedAt).toBeUndefined()
  })

  it('attaches raw', () => {
    expect(transformTicket(raw).raw).toBe(raw)
  })
})

// ── transformMessage ──────────────────────────────────────────────────────────

describe('transformMessage', () => {
  const rawComment: RawFrappeComment = {
    name: 'HDC-00001',
    reference_ticket: 'HD-TICKET-00001',
    commented_by: 'agent@example.com',
    content: '<p>Hello, please try resetting your password.</p>',
    is_pinned: 0,
    creation: '2026-01-16T10:00:00',
    modified: '2026-01-16T10:00:00',
  }

  it('maps id and platform', () => {
    const m = transformMessage(rawComment, 'HD-TICKET-00001')
    expect(m.id).toBe('HDC-00001')
    expect(m.platform).toBe('frappe-helpdesk')
  })

  it('maps ticketId', () => {
    expect(transformMessage(rawComment, 'HD-TICKET-00001').ticketId).toBe('HD-TICKET-00001')
  })

  it('maps public type for non-pinned comment', () => {
    expect(transformMessage(rawComment, 'HD-TICKET-00001').type).toBe('public')
  })

  it('maps internal type for pinned comment', () => {
    const m = transformMessage({ ...rawComment, is_pinned: 1 }, 'HD-TICKET-00001')
    expect(m.type).toBe('internal')
  })

  it('strips HTML tags from body', () => {
    const m = transformMessage(rawComment, 'HD-TICKET-00001')
    expect(m.body).toBe('Hello, please try resetting your password.')
    expect(m.body).not.toContain('<')
  })

  it('maps authorId', () => {
    expect(transformMessage(rawComment, 'HD-TICKET-00001').authorId).toBe('agent@example.com')
  })

  it('maps createdAt to ISO-8601', () => {
    expect(transformMessage(rawComment, 'HD-TICKET-00001').createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('attaches raw', () => {
    expect(transformMessage(rawComment, 'HD-TICKET-00001').raw).toBe(rawComment)
  })
})

// ── transformContact ──────────────────────────────────────────────────────────

describe('transformContact', () => {
  const rawCustomer: RawFrappeCustomer = {
    name: 'acme-corp',
    customer_name: 'Acme Corp',
    domain: 'acme.com',
    image: null,
  }

  it('maps id and platform', () => {
    const c = transformContact(rawCustomer)
    expect(c.id).toBe('acme-corp')
    expect(c.platform).toBe('frappe-helpdesk')
  })

  it('maps name from customer_name', () => {
    expect(transformContact(rawCustomer).name).toBe('Acme Corp')
  })

  it('falls back to name field when customer_name absent', () => {
    const c = transformContact({ name: 'fallback-id' })
    expect(c.name).toBe('fallback-id')
  })

  it('domain is in metadata', () => {
    const c = transformContact(rawCustomer)
    expect(c.metadata['domain']).toBe('acme.com')
  })

  it('email is undefined (HD Customer is company-level)', () => {
    expect(transformContact(rawCustomer).email).toBeUndefined()
  })

  it('attaches raw', () => {
    expect(transformContact(rawCustomer).raw).toBe(rawCustomer)
  })
})

// ── transformUser ─────────────────────────────────────────────────────────────

describe('transformUser', () => {
  const rawAgent: RawFrappeAgent = {
    name: 'agent@example.com',
    agent_name: 'Agent Alice',
    user: 'agent@example.com',
    is_active: 1,
    availability: 'Online',
  }

  it('maps id and platform', () => {
    const u = transformUser(rawAgent)
    expect(u.id).toBe('agent@example.com')
    expect(u.platform).toBe('frappe-helpdesk')
  })

  it('maps name from agent_name', () => {
    expect(transformUser(rawAgent).name).toBe('Agent Alice')
  })

  it('maps email from user field', () => {
    expect(transformUser(rawAgent).email).toBe('agent@example.com')
  })

  it('role is agent', () => {
    expect(transformUser(rawAgent).role).toBe('agent')
  })

  it('includes availability in metadata', () => {
    expect(transformUser(rawAgent).metadata['availability']).toBe('Online')
  })

  it('attaches raw', () => {
    expect(transformUser(rawAgent).raw).toBe(rawAgent)
  })
})

// ── transformTeam ─────────────────────────────────────────────────────────────

describe('transformTeam', () => {
  const rawTeam: RawFrappeTeam = {
    name: 'tier-1',
    team_name: 'Tier 1 Support',
    disabled: 0,
  }

  it('maps id and platform', () => {
    const t = transformTeam(rawTeam)
    expect(t.id).toBe('tier-1')
    expect(t.platform).toBe('frappe-helpdesk')
  })

  it('maps name from team_name', () => {
    expect(transformTeam(rawTeam).name).toBe('Tier 1 Support')
  })

  it('falls back to name when team_name absent', () => {
    const t = transformTeam({ name: 'fallback' })
    expect(t.name).toBe('fallback')
  })

  it('attaches raw', () => {
    expect(transformTeam(rawTeam).raw).toBe(rawTeam)
  })
})

// ── transformTag ──────────────────────────────────────────────────────────────

describe('transformTag', () => {
  const rawPriority: RawFrappePriority = {
    name: 'High',
    description: 'High priority',
    integer_value: 2,
    disabled: 0,
  }

  it('maps id and platform', () => {
    const tag = transformTag(rawPriority)
    expect(tag.id).toBe('High')
    expect(tag.platform).toBe('frappe-helpdesk')
  })

  it('maps name', () => {
    expect(transformTag(rawPriority).name).toBe('High')
  })

  it('includes description in metadata', () => {
    expect(transformTag(rawPriority).metadata['description']).toBe('High priority')
  })

  it('attaches raw', () => {
    expect(transformTag(rawPriority).raw).toBe(rawPriority)
  })
})

// ── transformMacro ────────────────────────────────────────────────────────────

describe('transformMacro', () => {
  const rawReply: RawFrappeSavedReply = {
    name: 'SR-001',
    title: 'Password Reset Instructions',
    message: '<p>Please click <strong>Reset Password</strong> on the login page.</p>',
    team: 'Tier 1 Support',
  }

  it('maps id and platform', () => {
    const m = transformMacro(rawReply)
    expect(m.id).toBe('SR-001')
    expect(m.platform).toBe('frappe-helpdesk')
  })

  it('maps title', () => {
    expect(transformMacro(rawReply).title).toBe('Password Reset Instructions')
  })

  it('strips HTML tags from body', () => {
    const m = transformMacro(rawReply)
    expect(m.body).not.toContain('<')
    expect(m.body).toContain('Reset Password')
  })

  it('maps category from team', () => {
    expect(transformMacro(rawReply).category).toBe('Tier 1 Support')
  })

  it('attaches raw', () => {
    expect(transformMacro(rawReply).raw).toBe(rawReply)
  })
})
