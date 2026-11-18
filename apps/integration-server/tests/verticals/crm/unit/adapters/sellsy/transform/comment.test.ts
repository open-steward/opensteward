/**
 * Fixture: the property examples of `CommentItem` in the Sellsy API v2
 * OpenAPI spec (https://docs.sellsy.com/api/v2/dist/sellsy.v2.latest.yaml).
 */
import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformComment } from '../../../../../../../src/verticals/crm/adapters/sellsy/transform/comment'
import type { RawSellsyComment } from '../../../../../../../src/verticals/crm/adapters/sellsy/transform/comment'

function makeRaw(overrides: Partial<RawSellsyComment> = {}): RawSellsyComment {
  return {
    id: 1,
    owner: { id: 123, type: 'staff' },
    description: 'Called about the renewal',
    updated: '1970-01-01T00:00:00+00:00',
    created: '1970-01-01T00:00:00+00:00',
    parent_id: null,
    related: [{ id: 1, type: 'opportunity' }],
    company_id: 123,
    individual_id: null,
    contact_id: 123,
    timetracking: null,
    ...overrides,
  }
}

describe('sellsy transformComment', () => {
  it('maps the documented fields and parses as a Note', () => {
    const raw = makeRaw()
    const note = NoteSchema.parse(transformComment(raw))
    expect(note).toEqual({
      id: '1',
      content: 'Called about the renewal',
      contact_id: '123',
      company_id: '123',
      deal_id: '1',
      owner_id: '123',
      created_at: '1970-01-01T00:00:00+00:00',
      updated_at: '1970-01-01T00:00:00+00:00',
      metadata: raw,
    })
  })

  it('takes deal_id only from an opportunity in related', () => {
    const note = NoteSchema.parse(
      transformComment(makeRaw({ related: [{ id: 9, type: 'company' }] })),
    )
    expect(note.deal_id).toBeUndefined()
    expect(NoteSchema.parse(transformComment(makeRaw({ related: [] }))).deal_id).toBeUndefined()
  })

  it('takes owner_id only from a staff owner', () => {
    const note = NoteSchema.parse(transformComment(makeRaw({ owner: { id: 7, type: 'contact' } })))
    expect(note.owner_id).toBeUndefined()
  })

  it('leaves null links out', () => {
    const note = NoteSchema.parse(transformComment(makeRaw({ company_id: null, contact_id: null })))
    expect(note.company_id).toBeUndefined()
    expect(note.contact_id).toBeUndefined()
  })

  it('throws rather than inventing content when description is absent', () => {
    const raw = makeRaw()
    delete raw.description
    expect(() => transformComment(raw)).toThrow(/description/)
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformComment(raw).metadata).toBe(raw)
  })
})
