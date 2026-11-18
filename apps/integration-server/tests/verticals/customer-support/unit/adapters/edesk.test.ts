import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/edesk/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/edesk/transform/message'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/edesk/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/edesk/transform/user'
import { transformTag } from '../../../../../src/verticals/customer-support/adapters/edesk/transform/tag'

describe('eDesk transformTicket', () => {
  it('sets closedAt when status is closed', () => {
    const out = transformTicket({
      id: 1,
      status: 'Closed',
      last_updated_at: '2026-02-01T14:20:00Z',
      created_at: '2026-01-15T09:30:00Z',
    })
    expect(out.status).toBe('closed')
    expect(out.closedAt).toBe('2026-02-01T14:20:00.000Z')
    expect(out.resolvedAt).toBe('2026-02-01T14:20:00.000Z')
  })

  it('does not set closedAt for open tickets', () => {
    const out = transformTicket({
      id: 2,
      status: 'Open',
      last_updated_at: '2026-02-01T14:20:00Z',
      created_at: '2026-01-15T09:30:00Z',
    })
    expect(out.status).toBe('open')
    expect(out.closedAt).toBeUndefined()
    expect(out.resolvedAt).toBeUndefined()
  })

  it('does not set closedAt for pending tickets', () => {
    const out = transformTicket({
      id: 3,
      status: 'Pending',
      last_updated_at: '2026-02-01T14:20:00Z',
      created_at: '2026-01-15T09:30:00Z',
    })
    expect(out.status).toBe('pending')
    expect(out.closedAt).toBeUndefined()
  })

  it('sets closedAt for spam (maps to closed)', () => {
    const out = transformTicket({
      id: 4,
      status: 'Spam',
      last_updated_at: '2026-02-01T14:20:00Z',
      created_at: '2026-01-15T09:30:00Z',
    })
    expect(out.status).toBe('closed')
    expect(out.closedAt).toBe('2026-02-01T14:20:00.000Z')
  })

  it('sets platform to edesk', () => {
    const out = transformTicket({ id: 5, status: 'Open', created_at: '2026-01-01T00:00:00Z' })
    expect(out.platform).toBe('edesk')
  })

  it('maps channel type to email', () => {
    const out = transformTicket({ id: 6, type: 'email', created_at: '2026-01-01T00:00:00Z' })
    expect(out.channel).toBe('email')
  })

  it('maps channel order to email', () => {
    const out = transformTicket({ id: 7, type: 'order', created_at: '2026-01-01T00:00:00Z' })
    expect(out.channel).toBe('email')
  })

  it('maps channel chat to chat', () => {
    const out = transformTicket({ id: 8, type: 'chat', created_at: '2026-01-01T00:00:00Z' })
    expect(out.channel).toBe('chat')
  })

  it('handles null status gracefully', () => {
    const out = transformTicket({ id: 9, status: null, created_at: '2026-01-01T00:00:00Z' })
    expect(out.status).toBe('open')
    expect(out.closedAt).toBeUndefined()
  })

  it('sets id, externalId, and number from raw id', () => {
    const out = transformTicket({ id: 42, created_at: '2026-01-01T00:00:00Z' })
    expect(out.id).toBe('42')
    expect(out.externalId).toBe('42')
    expect(out.number).toBe('42')
  })

  it('populates tagIds from tags_ids', () => {
    const out = transformTicket({ id: 10, tags_ids: [1, 2, 3], created_at: '2026-01-01T00:00:00Z' })
    expect(out.tagIds).toEqual(['1', '2', '3'])
  })
})

describe('eDesk transformMessage', () => {
  it('maps Incoming direction to contact authorType', () => {
    const out = transformMessage(
      { id: 1, direction: 'Incoming', created_at: '2026-01-01T00:00:00Z' },
      't1',
    )
    expect(out.authorType).toBe('contact')
    expect(out.platform).toBe('edesk')
  })

  it('maps Outgoing direction to user authorType', () => {
    const out = transformMessage(
      { id: 2, direction: 'Outgoing', created_at: '2026-01-01T00:00:00Z' },
      't2',
    )
    expect(out.authorType).toBe('user')
  })

  it('maps Note type to internal', () => {
    const out = transformMessage({ id: 3, type: 'Note', created_at: '2026-01-01T00:00:00Z' }, 't1')
    expect(out.type).toBe('internal')
  })
})

describe('eDesk transformContact', () => {
  it('maps full_name and email', () => {
    const out = transformContact({ id: 1, full_name: 'Jane Doe', email: 'jane@example.com' })
    expect(out.name).toBe('Jane Doe')
    expect(out.email).toBe('jane@example.com')
    expect(out.platform).toBe('edesk')
  })
})

describe('eDesk transformUser', () => {
  it('maps name, email, and role', () => {
    const out = transformUser({
      id: 1,
      name: 'Agent Smith',
      email: 'agent@example.com',
      role: 'admin',
    })
    expect(out.name).toBe('Agent Smith')
    expect(out.email).toBe('agent@example.com')
    expect(out.role).toBe('admin')
    expect(out.platform).toBe('edesk')
  })
})

describe('eDesk transformTag', () => {
  it('maps name and metadata', () => {
    const out = transformTag({ id: 1, name: 'billing', color: '#ff0000' })
    expect(out.name).toBe('billing')
    expect(out.metadata['color']).toBe('#ff0000')
    expect(out.platform).toBe('edesk')
  })
})
