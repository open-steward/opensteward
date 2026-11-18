import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/osticket/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/osticket/transform/message'

describe('osTicket transformTicket', () => {
  it('sets platform to osticket', () => {
    const out = transformTicket({ id: 1, created: '2026-01-01T00:00:00Z' })
    expect(out.platform).toBe('osticket')
  })

  it('sets closedAt and resolvedAt when status is closed', () => {
    const out = transformTicket({
      id: 2,
      state: 'closed',
      closed: '2026-02-01T14:20:00Z',
      created: '2026-01-15T09:30:00Z',
    })
    expect(out.status).toBe('closed')
    expect(out.closedAt).toBe('2026-02-01T14:20:00.000Z')
    expect(out.resolvedAt).toBe('2026-02-01T14:20:00.000Z')
  })

  it('does not set closedAt or resolvedAt for open tickets', () => {
    const out = transformTicket({
      id: 3,
      state: 'open',
      created: '2026-01-15T09:30:00Z',
    })
    expect(out.status).toBe('open')
    expect(out.closedAt).toBeUndefined()
    expect(out.resolvedAt).toBeUndefined()
  })

  it('falls back dueDate for updatedAt when updated is absent', () => {
    const out = transformTicket({
      id: 4,
      dueDate: '2026-03-01T00:00:00Z',
      created: '2026-01-01T00:00:00Z',
    })
    expect(out.updatedAt).toBe('2026-03-01T00:00:00.000Z')
  })

  it('prefers updated over dueDate for updatedAt', () => {
    const out = transformTicket({
      id: 5,
      updated: '2026-02-01T00:00:00Z',
      dueDate: '2026-03-01T00:00:00Z',
      created: '2026-01-01T00:00:00Z',
    })
    expect(out.updatedAt).toBe('2026-02-01T00:00:00.000Z')
  })

  it('maps state=closed via status name fallback', () => {
    const out = transformTicket({
      id: 6,
      status: 'Closed',
      created: '2026-01-01T00:00:00Z',
    })
    expect(out.status).toBe('closed')
  })

  it('maps status resolved', () => {
    const out = transformTicket({
      id: 7,
      status: 'Resolved',
      created: '2026-01-01T00:00:00Z',
    })
    expect(out.status).toBe('resolved')
  })

  it('maps priority numeric id 3 to high', () => {
    const out = transformTicket({ id: 8, priorityId: 3, created: '2026-01-01T00:00:00Z' })
    expect(out.priority).toBe('high')
  })

  it('maps priority name critical to urgent', () => {
    const out = transformTicket({ id: 9, priority: 'Critical', created: '2026-01-01T00:00:00Z' })
    expect(out.priority).toBe('urgent')
  })

  it('maps source=Email to channel email', () => {
    const out = transformTicket({ id: 10, source: 'Email', created: '2026-01-01T00:00:00Z' })
    expect(out.channel).toBe('email')
  })

  it('maps source=Phone to channel voice', () => {
    const out = transformTicket({ id: 11, source: 'Phone', created: '2026-01-01T00:00:00Z' })
    expect(out.channel).toBe('voice')
  })

  it('handles missing fields without throwing', () => {
    expect(() => transformTicket({})).not.toThrow()
  })
})

describe('osTicket transformMessage', () => {
  it('maps type=message to authorType contact', () => {
    const out = transformMessage({ id: 1, type: 'message', timestamp: '2026-01-01T00:00:00Z' }, 't1')
    expect(out.authorType).toBe('contact')
    expect(out.platform).toBe('osticket')
  })

  it('maps type=response to authorType user (staff response)', () => {
    const out = transformMessage({ id: 2, type: 'response', timestamp: '2026-01-01T00:00:00Z' }, 't1')
    expect(out.authorType).toBe('user')
  })

  it('maps type=note to authorType user and type internal', () => {
    const out = transformMessage({ id: 3, type: 'note', timestamp: '2026-01-01T00:00:00Z' }, 't1')
    expect(out.authorType).toBe('user')
    expect(out.type).toBe('internal')
  })

  it('authorType is never "agent" — must be a valid AuthorTypeSchema value', () => {
    const validTypes = ['contact', 'user', 'system']
    for (const entryType of ['message', 'response', 'note', 'unknown', undefined]) {
      const out = transformMessage({ id: 4, type: entryType, timestamp: '2026-01-01T00:00:00Z' }, 't1')
      expect(validTypes).toContain(out.authorType)
    }
  })

  it('maps staffId to authorId', () => {
    const out = transformMessage({ id: 5, staffId: 42, timestamp: '2026-01-01T00:00:00Z' }, 't1')
    expect(out.authorId).toBe('42')
  })

  it('maps attachment count from attachment_count field', () => {
    const out = transformMessage({ id: 6, attachment_count: 3, timestamp: '2026-01-01T00:00:00Z' }, 't1')
    expect(out.attachmentCount).toBe(3)
  })

  it('handles missing fields without throwing', () => {
    expect(() => transformMessage({}, 't1')).not.toThrow()
  })
})
