import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  type RawHelpjuiceComment,
} from '../../../../../../../src/verticals/customer-support/adapters/helpjuice/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

describe('helpjuice transformMessage', () => {
  it('sets ticketId from articleId argument', () => {
    const raw: RawHelpjuiceComment = { id: 10, body: 'Hello', user_id: 5 }
    const result = transformMessage(raw, 'article-42')
    expect(result.ticketId).toBe('article-42')
  })

  it('uses user_id as authorId when present', () => {
    const raw: RawHelpjuiceComment = { id: 11, user_id: 7, author_id: 3 }
    const result = transformMessage(raw, 'a1')
    expect(result.authorId).toBe('7')
  })

  it('falls back to author_id when user_id is absent', () => {
    const raw: RawHelpjuiceComment = { id: 12, author_id: 99 }
    const result = transformMessage(raw, 'a1')
    expect(result.authorId).toBe('99')
  })

  it('always sets authorType to user', () => {
    const raw: RawHelpjuiceComment = { id: 13, user_id: 1 }
    const result = transformMessage(raw, 'a1')
    expect(result.authorType).toBe('user')
  })

  it('always sets type to public', () => {
    const raw: RawHelpjuiceComment = { id: 14, user_id: 1 }
    const result = transformMessage(raw, 'a1')
    expect(result.type).toBe('public')
  })

  it('maps body from raw.body', () => {
    const raw: RawHelpjuiceComment = { id: 15, body: 'Great article!', user_id: 2 }
    const result = transformMessage(raw, 'a2')
    expect(result.body).toBe('Great article!')
  })

  it('sets platform to helpjuice', () => {
    const raw: RawHelpjuiceComment = { id: 16, user_id: 1 }
    const result = transformMessage(raw, 'a1')
    expect(result.platform).toBe('helpjuice')
  })

  it('passes MessageSchema validation', () => {
    const raw: RawHelpjuiceComment = {
      id: 20,
      body: 'Test comment',
      user_id: 5,
      created_at: '2026-01-15T09:30:00.000Z',
    }
    const result = transformMessage(raw, 'article-1')
    expect(() => MessageSchema.parse(result)).not.toThrow()
  })
})
