import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawHelpjuiceArticle,
} from '../../../../../../../src/verticals/customer-support/adapters/helpjuice/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

describe('helpjuice transformTicket', () => {
  it('maps published article to resolved status', () => {
    const raw: RawHelpjuiceArticle = {
      id: 1,
      name: 'How to reset password',
      published: true,
      created_at: '2026-01-15T09:30:00.000Z',
      updated_at: '2026-02-01T14:20:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.status).toBe('resolved')
    expect(result.resolvedAt).toBe('2026-02-01T14:20:00.000Z')
  })

  it('maps archived article to closed status', () => {
    const raw: RawHelpjuiceArticle = {
      id: 2,
      name: 'Old article',
      archived: true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-03-01T00:00:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.status).toBe('closed')
    expect(result.closedAt).toBe('2026-03-01T00:00:00.000Z')
    expect(result.resolvedAt).toBeUndefined()
  })

  it('maps unpublished article to open status', () => {
    const raw: RawHelpjuiceArticle = {
      id: 3,
      name: 'Draft article',
      published: false,
      created_at: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.status).toBe('open')
    expect(result.resolvedAt).toBeUndefined()
    expect(result.closedAt).toBeUndefined()
  })

  it('always sets channel to web', () => {
    const raw: RawHelpjuiceArticle = { id: 4, created_at: '2026-01-15T09:30:00.000Z' }
    const result = transformTicket(raw)
    expect(result.channel).toBe('web')
  })

  it('maps category_ids to tagIds as strings', () => {
    const raw: RawHelpjuiceArticle = {
      id: 5,
      category_ids: [10, 20, 30],
      created_at: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.tagIds).toEqual(['10', '20', '30'])
  })

  it('maps author_id to requesterId', () => {
    const raw: RawHelpjuiceArticle = {
      id: 6,
      author_id: 55,
      created_at: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.requesterId).toBe('55')
  })

  it('maps name to subject', () => {
    const raw: RawHelpjuiceArticle = {
      id: 7,
      name: 'Getting started',
      created_at: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.subject).toBe('Getting started')
  })

  it('sets platform to helpjuice', () => {
    const raw: RawHelpjuiceArticle = { id: 8, created_at: '2026-01-15T09:30:00.000Z' }
    const result = transformTicket(raw)
    expect(result.platform).toBe('helpjuice')
  })

  it('passes TicketSchema validation', () => {
    const raw: RawHelpjuiceArticle = {
      id: 99,
      name: 'Schema valid article',
      published: true,
      author_id: 7,
      category_ids: [1, 2],
      created_at: '2026-01-15T09:30:00.000Z',
      updated_at: '2026-02-01T14:20:00.000Z',
    }
    const result = transformTicket(raw)
    expect(() => TicketSchema.parse(result)).not.toThrow()
  })
})
