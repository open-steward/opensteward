import { describe, it, expect } from 'vitest'
import {
  transformCategory,
  type RawKnowmaxCategory,
} from '../../../../../../../src/verticals/customer-support/adapters/chatbot-knowmax/transform/team'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema/team'

describe('chatbot-knowmax transformCategory', () => {
  const raw: RawKnowmaxCategory = {
    id: 42,
    name: 'Billing Questions',
    description: 'All billing-related articles',
    parent_id: null,
    articles_count: 15,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-02-01T00:00:00.000Z',
  }

  it('maps id to string', () => {
    const out = transformCategory(raw)
    expect(out.id).toBe('42')
  })

  it('maps externalId to string id', () => {
    const out = transformCategory(raw)
    expect(out.externalId).toBe('42')
  })

  it('maps name from raw.name', () => {
    const out = transformCategory(raw)
    expect(out.name).toBe('Billing Questions')
  })

  it('sets platform to chatbot-knowmax', () => {
    const out = transformCategory(raw)
    expect(out.platform).toBe('chatbot-knowmax')
  })

  it('stores description in metadata', () => {
    const out = transformCategory(raw)
    expect(out.metadata.description).toBe('All billing-related articles')
  })

  it('stores articlesCount in metadata', () => {
    const out = transformCategory(raw)
    expect(out.metadata.articlesCount).toBe('15')
  })

  it('passes TeamSchema.parse', () => {
    const out = transformCategory(raw)
    expect(() => TeamSchema.parse(out)).not.toThrow()
  })

  it('handles string id', () => {
    const out = transformCategory({ id: 'cat_str', name: 'FAQ' })
    expect(out.id).toBe('cat_str')
  })

  it('falls back to empty string for name when missing', () => {
    const out = transformCategory({ id: 1 })
    expect(out.name).toBe('')
  })
})
