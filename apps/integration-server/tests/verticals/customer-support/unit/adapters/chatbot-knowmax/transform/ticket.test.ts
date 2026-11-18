import { describe, it, expect } from 'vitest'
import {
  transformArticle,
  type RawKnowmaxArticle,
} from '../../../../../../../src/verticals/customer-support/adapters/chatbot-knowmax/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

describe('chatbot-knowmax transformArticle', () => {
  const raw: RawKnowmaxArticle = {
    id: 101,
    title: 'How to reset your password',
    content: '<p>Go to settings and click Reset Password.</p>',
    status: 'published',
    category_id: 42,
    type: 'article',
    author_id: 7,
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-02-01T14:20:00.000Z',
    published_at: '2026-01-15T10:00:00.000Z',
    tags: ['password', 'account'],
    views: 350,
  }

  it('maps id to string', () => {
    const out = transformArticle(raw)
    expect(out.id).toBe('101')
  })

  it('maps subject from title', () => {
    const out = transformArticle(raw)
    expect(out.subject).toBe('How to reset your password')
  })

  it('maps published status → open', () => {
    const out = transformArticle(raw)
    expect(out.status).toBe('open')
  })

  it('maps draft status → pending', () => {
    const out = transformArticle({ ...raw, status: 'draft' })
    expect(out.status).toBe('pending')
  })

  it('maps archived status → closed', () => {
    const out = transformArticle({ ...raw, status: 'archived' })
    expect(out.status).toBe('closed')
  })

  it('maps article type → web channel', () => {
    const out = transformArticle(raw)
    expect(out.channel).toBe('web')
  })

  it('maps decision_tree type → chat channel', () => {
    const out = transformArticle({ ...raw, type: 'decision_tree' })
    expect(out.channel).toBe('chat')
  })

  it('maps requesterId from author_id', () => {
    const out = transformArticle(raw)
    expect(out.requesterId).toBe('7')
  })

  it('maps teamId from category_id', () => {
    const out = transformArticle(raw)
    expect(out.teamId).toBe('42')
  })

  it('maps tagIds from tags array', () => {
    const out = transformArticle(raw)
    expect(out.tagIds).toEqual(['password', 'account'])
  })

  it('maps createdAt from created_at', () => {
    const out = transformArticle(raw)
    expect(out.createdAt).toBe('2026-01-15T09:30:00.000Z')
  })

  it('maps updatedAt from updated_at', () => {
    const out = transformArticle(raw)
    expect(out.updatedAt).toBe('2026-02-01T14:20:00.000Z')
  })

  it('sets resolvedAt for archived articles', () => {
    const out = transformArticle({ ...raw, status: 'archived' })
    expect(out.resolvedAt).toBeDefined()
  })

  it('does not set resolvedAt for published articles', () => {
    const out = transformArticle(raw)
    expect(out.resolvedAt).toBeUndefined()
  })

  it('sets platform to chatbot-knowmax', () => {
    const out = transformArticle(raw)
    expect(out.platform).toBe('chatbot-knowmax')
  })

  it('stores type and views in metadata', () => {
    const out = transformArticle(raw)
    expect(out.metadata.type).toBe('article')
    expect(out.metadata.views).toBe('350')
  })

  it('passes TicketSchema.parse', () => {
    const out = transformArticle(raw)
    expect(() => TicketSchema.parse(out)).not.toThrow()
  })

  it('defaults tagIds to [] when tags is missing', () => {
    const out = transformArticle({ id: 1, title: 'Bare' })
    expect(out.tagIds).toEqual([])
  })

  it('falls back to epoch-0 when created_at is missing', () => {
    const out = transformArticle({ id: 1, title: 'No date' })
    expect(out.createdAt).toBe(new Date(0).toISOString())
  })
})
