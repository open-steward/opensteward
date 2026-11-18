import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyPyrusWebhook,
  parsePyrusWebhookEvents,
} from '../../../../../src/verticals/customer-support/adapters/pyrus/webhook'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/pyrus/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/pyrus/transform/message'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/pyrus/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/pyrus/transform/user'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/pyrus/transform/team'

// ── Webhook ────────────────────────────────────────────────────────────────

describe('Pyrus webhook', () => {
  it('verifies HMAC-SHA1(key=secret, msg=body) hex-encoded', () => {
    const secret = 'my-security-key'
    const body = Buffer.from(JSON.stringify({ event: 'comment', task_id: 1 }))
    // Correct signature: HMAC-SHA1 with key=secret, msg=body (NOT body+secret)
    const sig = createHmac('sha1', secret).update(body).digest('hex')
    expect(verifyPyrusWebhook(body, { 'x-pyrus-sig': sig }, secret)).toBe(true)
  })

  it('rejects a signature computed over body+secret concatenation', () => {
    const secret = 'my-security-key'
    const body = Buffer.from('{}')
    // Wrong: hashes the concatenation body+secret instead of keying the HMAC
    // with the secret
    const wrongSig = createHmac('sha1', secret)
      .update(Buffer.concat([body, Buffer.from(secret, 'utf8')]))
      .digest('hex')
    expect(verifyPyrusWebhook(body, { 'x-pyrus-sig': wrongSig }, secret)).toBe(false)
  })

  it('is case-insensitive on the hex signature', () => {
    const secret = 'k'
    const body = Buffer.from('hello')
    const sig = createHmac('sha1', secret).update(body).digest('hex').toUpperCase()
    expect(verifyPyrusWebhook(body, { 'x-pyrus-sig': sig }, secret)).toBe(true)
  })

  it('rejects missing signature header', () => {
    expect(verifyPyrusWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('rejects wrong secret', () => {
    const body = Buffer.from('hello')
    const sig = createHmac('sha1', 'correct').update(body).digest('hex')
    expect(verifyPyrusWebhook(body, { 'x-pyrus-sig': sig }, 'wrong')).toBe(false)
  })

  it('parsePyrusWebhookEvents returns platform=pyrus for a comment event', () => {
    const events = parsePyrusWebhookEvents({ event: 'comment', task_id: 42, user_id: 7 })
    expect(Array.isArray(events)).toBe(true)
    expect(events.length).toBeGreaterThan(0)
    expect(events[0]!.platform).toBe('pyrus')
    expect(events[0]!.resourceType).toBe('messages')
    expect(events[0]!.action).toBe('commented')
    expect(events[0]!.resourceId).toBe('42')
    expect(events[0]!.ticketId).toBe('42')
  })

  it('parsePyrusWebhookEvents defaults to tickets/updated for unknown events', () => {
    const events = parsePyrusWebhookEvents({ event: 'unknown_event', task_id: 99 })
    expect(events[0]!.resourceType).toBe('tickets')
    expect(events[0]!.action).toBe('updated')
  })
})

// ── Ticket transform ───────────────────────────────────────────────────────

describe('Pyrus transformTicket', () => {
  it('maps an open task', () => {
    const out = transformTicket({
      id: 100,
      text: 'Fix the bug\nMore details',
      create_date: '2026-01-01T10:00:00Z',
      last_modified_date: '2026-01-02T12:00:00Z',
    })
    expect(out.id).toBe('100')
    expect(out.platform).toBe('pyrus')
    expect(out.status).toBe('open')
    expect(out.subject).toBe('Fix the bug')
    expect(out.channel).toBe('other')
    expect(out.raw).toBeDefined()
  })

  it('maps a closed task (close_date present)', () => {
    const out = transformTicket({
      id: 200,
      text: 'Done task',
      close_date: '2026-02-01T00:00:00Z',
      create_date: '2026-01-01T00:00:00Z',
    })
    expect(out.status).toBe('closed')
    expect(out.closedAt).toBeTruthy()
  })

  it('maps a resolved task (last comment action=finished)', () => {
    const out = transformTicket({
      id: 300,
      text: 'Resolved task',
      create_date: '2026-01-01T00:00:00Z',
      comments: [{ id: 1, action: 'finished', create_date: '2026-01-02T00:00:00Z' }],
    })
    expect(out.status).toBe('resolved')
  })

  it('sets platform=pyrus and metadata.formId when form_id is present', () => {
    const out = transformTicket({ id: 400, text: 'Form task', form_id: 55, create_date: '2026-01-01T00:00:00Z' })
    expect(out.metadata?.['formId']).toBe('55')
  })

  it('guards non-string create_date gracefully', () => {
    const out = transformTicket({ id: 500, text: 'Task', create_date: undefined })
    expect(typeof out.createdAt).toBe('string')
  })
})

// ── Message transform ──────────────────────────────────────────────────────

describe('Pyrus transformMessage', () => {
  it('maps a comment with text and author', () => {
    const out = transformMessage(
      {
        id: 10,
        text: 'Hello from agent',
        author: { id: 7, first_name: 'Alice', type: 'user' },
        create_date: '2026-01-03T08:00:00Z',
      },
      '100',
    )
    expect(out.id).toBe('10')
    expect(out.ticketId).toBe('100')
    expect(out.body).toBe('Hello from agent')
    expect(out.authorType).toBe('user')
    expect(out.platform).toBe('pyrus')
    expect(out.type).toBe('public')
  })

  it('defaults authorType to contact for non-user author', () => {
    const out = transformMessage({ id: 11, text: 'Reply', author: { id: 3, type: 'contact' } }, '101')
    expect(out.authorType).toBe('contact')
  })

  it('surfaces action in metadata', () => {
    const out = transformMessage({ id: 12, text: '', action: 'finished' }, '102')
    expect(out.metadata?.['action']).toBe('finished')
  })
})

// ── Contact transform ──────────────────────────────────────────────────────

describe('Pyrus transformContact', () => {
  it('maps a person with full fields', () => {
    const out = transformContact({
      id: 55,
      first_name: 'Bob',
      last_name: 'Smith',
      email: 'bob@example.com',
      mobile_phone: '+1234567890',
      organization_id: 9,
      department_id: 3,
      department_name: 'Sales',
    })
    expect(out.id).toBe('55')
    expect(out.name).toBe('Bob Smith')
    expect(out.email).toBe('bob@example.com')
    expect(out.phone).toBe('+1234567890')
    expect(out.organizationId).toBe('9')
    expect(out.platform).toBe('pyrus')
    expect(out.metadata?.['departmentId']).toBe('3')
  })

  it('handles missing optional fields', () => {
    const out = transformContact({ id: 56 })
    expect(out.name).toBe('')
    expect(out.email).toBeUndefined()
    expect(out.phone).toBeUndefined()
  })
})

// ── User transform ─────────────────────────────────────────────────────────

describe('Pyrus transformUser', () => {
  it('maps a member', () => {
    const out = transformUser({
      id: 77,
      first_name: 'Carol',
      last_name: 'Jones',
      email: 'carol@example.com',
      position: 'Support Agent',
      status: 'active',
    })
    expect(out.id).toBe('77')
    expect(out.name).toBe('Carol Jones')
    expect(out.email).toBe('carol@example.com')
    expect(out.role).toBe('Support Agent')
    expect(out.teamIds).toEqual([])
    expect(out.platform).toBe('pyrus')
  })

  it('falls back to type when position is absent', () => {
    const out = transformUser({ id: 78, type: 'admin' })
    expect(out.role).toBe('admin')
  })
})

// ── Team transform ─────────────────────────────────────────────────────────

describe('Pyrus transformTeam', () => {
  it('maps a role to team', () => {
    const out = transformTeam({
      id: 99,
      name: 'Support Team',
      member_ids: [1, 2, 3],
      type: 'role',
    })
    expect(out.id).toBe('99')
    expect(out.name).toBe('Support Team')
    expect(out.memberCount).toBe(3)
    expect(out.platform).toBe('pyrus')
    expect(out.metadata?.['type']).toBe('role')
  })

  it('handles missing member_ids', () => {
    const out = transformTeam({ id: 100, name: 'Empty Team' })
    expect(out.memberCount).toBeUndefined()
  })
})
