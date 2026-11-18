import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyPlainWebhook, parsePlainWebhookEvents } from '../../../../../src/verticals/customer-support/adapters/plain/webhook'
import { transformTicket, type RawPlainThread } from '../../../../../src/verticals/customer-support/adapters/plain/transform/ticket'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/plain/transform/contact'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/plain/transform/message'
import { transformTag } from '../../../../../src/verticals/customer-support/adapters/plain/transform/tag'

describe('Plain transformTicket', () => {
  it('maps a UserActor assignee (userId) correctly', () => {
    const raw: RawPlainThread = {
      id: 'th_01',
      title: 'Bug report',
      status: 'OPEN',
      priority: 1,
      customer: { id: 'cu_01' },
      assignee: { userId: 'u_01' },
      createdAt: { iso8601: '2026-01-01T00:00:00.000Z' },
      updatedAt: { iso8601: '2026-01-02T00:00:00.000Z' },
    }
    const out = transformTicket(raw)
    expect(out.id).toBe('th_01')
    expect(out.platform).toBe('plain')
    expect(out.status).toBe('open')
    expect(out.priority).toBe('high')
    expect(out.assigneeId).toBe('u_01')
    expect(out.requesterId).toBe('cu_01')
  })

  it('maps a MachineUserActor assignee (machineUserId) correctly', () => {
    const raw: RawPlainThread = {
      id: 'th_02',
      title: 'Auto-assigned',
      status: 'OPEN',
      customer: { id: 'cu_02' },
      assignee: { machineUserId: 'mu_01' },
    }
    const out = transformTicket(raw)
    expect(out.assigneeId).toBe('mu_01')
  })

  it('returns undefined assigneeId when assignee is null', () => {
    const raw: RawPlainThread = {
      id: 'th_03',
      title: 'Unassigned',
      status: 'OPEN',
      customer: { id: 'cu_03' },
      assignee: null,
    }
    const out = transformTicket(raw)
    expect(out.assigneeId).toBeUndefined()
  })

  it('maps DONE status to resolved', () => {
    const raw: RawPlainThread = {
      id: 'th_04',
      title: 'Done thread',
      status: 'DONE',
      customer: { id: 'cu_04' },
      updatedAt: { iso8601: '2026-02-01T00:00:00.000Z' },
    }
    const out = transformTicket(raw)
    expect(out.status).toBe('resolved')
    expect(out.resolvedAt).toBe('2026-02-01T00:00:00.000Z')
  })

  it('maps SNOOZED status to on_hold', () => {
    const raw: RawPlainThread = {
      id: 'th_05',
      title: 'Snoozed thread',
      status: 'SNOOZED',
      customer: { id: 'cu_05' },
    }
    const out = transformTicket(raw)
    expect(out.status).toBe('on_hold')
  })

  it('maps urgent priority (0)', () => {
    const raw: RawPlainThread = {
      id: 'th_06',
      title: 'Urgent',
      priority: 0,
      customer: { id: 'cu_06' },
    }
    const out = transformTicket(raw)
    expect(out.priority).toBe('urgent')
  })

  it('includes label type ids in tagIds', () => {
    const raw: RawPlainThread = {
      id: 'th_07',
      title: 'Tagged',
      customer: { id: 'cu_07' },
      labels: [
        { id: 'lbl_01', labelType: { id: 'lt_01', name: 'bug' } },
      ],
    }
    const out = transformTicket(raw)
    expect(out.tagIds).toContain('lt_01')
  })
})

describe('Plain transformContact', () => {
  it('maps a customer to canonical Contact', () => {
    const raw = {
      id: 'cu_01',
      fullName: 'Jane Doe',
      email: { email: 'jane@example.com', isVerified: true },
      phone: { phoneNumber: '+15555555555' },
      company: { id: 'co_01' },
      createdAt: { iso8601: '2026-01-01T00:00:00.000Z' },
      updatedAt: { iso8601: '2026-01-02T00:00:00.000Z' },
    }
    const out = transformContact(raw)
    expect(out.id).toBe('cu_01')
    expect(out.platform).toBe('plain')
    expect(out.name).toBe('Jane Doe')
    expect(out.email).toBe('jane@example.com')
    expect(out.phone).toBe('+15555555555')
    expect(out.organizationId).toBe('co_01')
  })
})

describe('Plain transformMessage', () => {
  it('maps a CustomerChatItem to a contact message', () => {
    const raw = {
      id: 'te_01',
      type: 'CustomerChatItem',
      timestamp: { iso8601: '2026-01-01T00:00:00.000Z' },
      customerActor: { customerId: 'cu_01' },
      text: { value: 'Hello there' },
    }
    const out = transformMessage(raw, 'th_01')
    expect(out.id).toBe('te_01')
    expect(out.platform).toBe('plain')
    expect(out.ticketId).toBe('th_01')
    expect(out.authorType).toBe('contact')
    expect(out.authorId).toBe('cu_01')
    expect(out.body).toBe('Hello there')
    expect(out.type).toBe('public')
  })

  it('maps a NoteItem to an internal message', () => {
    const raw = {
      id: 'te_02',
      type: 'NoteItem',
      timestamp: { iso8601: '2026-01-02T00:00:00.000Z' },
      userActor: { userId: 'u_01' },
      text: { value: 'Internal note' },
    }
    const out = transformMessage(raw, 'th_01')
    expect(out.type).toBe('internal')
    expect(out.authorType).toBe('user')
    expect(out.authorId).toBe('u_01')
  })
})

describe('Plain transformTag', () => {
  it('maps a label type to canonical Tag', () => {
    const raw = {
      id: 'lt_01',
      name: 'billing',
      color: '#e53935',
      isArchived: false,
    }
    const out = transformTag(raw)
    expect(out.id).toBe('lt_01')
    expect(out.platform).toBe('plain')
    expect(out.name).toBe('billing')
    expect(out.color).toBe('#e53935')
  })
})

describe('Plain webhook', () => {
  it('verifies HMAC-SHA256 signature', () => {
    const secret = 'webhook-secret'
    const body = Buffer.from('{"type":"thread.thread_created"}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(
      verifyPlainWebhook(body, { 'plain-request-signature': sig }, secret),
    ).toBe(true)
  })

  it('rejects invalid signature', () => {
    const body = Buffer.from('{"type":"thread.thread_created"}')
    expect(
      verifyPlainWebhook(body, { 'plain-request-signature': 'bad' }, 'secret'),
    ).toBe(false)
  })

  it('rejects missing signature header', () => {
    expect(verifyPlainWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parsePlainWebhookEvents returns platform=plain for thread.thread_created', () => {
    const out = parsePlainWebhookEvents({
      id: 'ev_01',
      type: 'thread.thread_created',
      payload: { thread: { id: 'th_01' } },
    })
    expect(Array.isArray(out)).toBe(true)
    expect(out[0]!.platform).toBe('plain')
    expect(out[0]!.resourceType).toBe('tickets')
    expect(out[0]!.action).toBe('created')
    expect(out[0]!.resourceId).toBe('th_01')
  })

  it('parsePlainWebhookEvents handles customer events', () => {
    const out = parsePlainWebhookEvents({
      id: 'ev_02',
      type: 'customer.customer_deleted',
      payload: { customer: { id: 'cu_01' } },
    })
    expect(out[0]!.resourceType).toBe('contacts')
    expect(out[0]!.action).toBe('deleted')
    expect(out[0]!.resourceId).toBe('cu_01')
  })
})
