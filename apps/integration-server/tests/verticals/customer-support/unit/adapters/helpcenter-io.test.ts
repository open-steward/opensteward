import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/helpcenter-io/transform/ticket'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/helpcenter-io/transform/team'

describe('HelpCenter.io transformTicket', () => {
  it('maps a published article to status=resolved', () => {
    const out = transformTicket({
      _id: 'abc123',
      title: { en: 'Getting started', de: 'Erste Schritte' },
      published: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    })
    expect(out.id).toBe('abc123')
    expect(out.platform).toBe('helpcenter-io')
    expect(out.status).toBe('resolved')
    expect(out.channel).toBe('web')
    expect(out.subject).toBe('Getting started')
    expect(out.createdAt).toBe('2026-01-01T00:00:00.000Z')
    expect(out.resolvedAt).toBeDefined()
  })

  it('maps a draft article to status=open', () => {
    const out = transformTicket({
      _id: 'draft1',
      title: { en: 'Draft article' },
      published: false,
    })
    expect(out.status).toBe('open')
    expect(out.resolvedAt).toBeUndefined()
  })

  it('falls back to first language when no en key', () => {
    const out = transformTicket({
      _id: 'fr1',
      title: { fr: 'Titre en français' },
      published: true,
    })
    expect(out.subject).toBe('Titre en français')
  })

  it('handles string title (non-multilingual)', () => {
    const out = transformTicket({
      _id: 'str1',
      title: 'Plain string title',
      published: false,
    })
    expect(out.subject).toBe('Plain string title')
  })

  it('uses primary category from categories array', () => {
    const out = transformTicket({
      _id: 'cat1',
      title: { en: 'Article' },
      categories: ['cat-id-1', 'cat-id-2'],
      published: true,
    })
    expect(out.teamId).toBe('cat-id-1')
  })

  it('uses category_id when categories array is absent', () => {
    const out = transformTicket({
      _id: 'cat2',
      title: { en: 'Article' },
      category_id: 'main-cat',
      published: true,
    })
    expect(out.teamId).toBe('main-cat')
  })

  it('falls back to id field when _id is absent', () => {
    const out = transformTicket({
      id: 99,
      title: { en: 'Article by id' },
      published: false,
    })
    expect(out.id).toBe('99')
  })

  it('returns empty string id when neither _id nor id present', () => {
    const out = transformTicket({ title: { en: 'No id' }, published: false })
    expect(out.id).toBe('')
  })

  it('never throws on empty input', () => {
    expect(() => transformTicket({})).not.toThrow()
  })
})

describe('HelpCenter.io transformTeam', () => {
  it('maps a category to Team', () => {
    const out = transformTeam({
      _id: 'cat-abc',
      name: { en: 'Support', de: 'Unterstützung' },
      description: { en: 'Main support category' },
      parent: null,
      icon: 'help-circle',
    })
    expect(out.id).toBe('cat-abc')
    expect(out.externalId).toBe('cat-abc')
    expect(out.name).toBe('Support')
    expect(out.platform).toBe('helpcenter-io')
    expect(out.metadata['description']).toBe('Main support category')
    expect(out.metadata['icon']).toBe('help-circle')
  })

  it('handles string name (non-multilingual)', () => {
    const out = transformTeam({ _id: 'str-cat', name: 'Sales' })
    expect(out.name).toBe('Sales')
  })

  it('falls back to first language when no en key', () => {
    const out = transformTeam({ _id: 'fr-cat', name: { fr: 'Catégorie' } })
    expect(out.name).toBe('Catégorie')
  })

  it('falls back to id when _id is absent', () => {
    const out = transformTeam({ id: 77, name: { en: 'Fallback' } })
    expect(out.id).toBe('77')
  })

  it('never throws on empty input', () => {
    expect(() => transformTeam({})).not.toThrow()
  })
})
