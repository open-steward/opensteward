import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawEspoCrmNote,
} from '../../../../../../../src/verticals/crm/adapters/espocrm/transform/note'

function makeRaw(overrides: Partial<RawEspoCrmNote> = {}): RawEspoCrmNote {
  return { id: '1', ...overrides }
}

describe('espocrm transformNote', () => {
  it('maps id', () => {
    const result = transformNote(makeRaw())
    expect(result.id).toBe('1')
  })

  it('throws rather than inventing an id', () => {
    expect(() => transformNote(makeRaw({ id: undefined }))).toThrow(/Note\.id/)
  })

  it('maps content from post', () => {
    const result = transformNote(makeRaw({ post: 'Meeting notes' }))
    expect(result.content).toBe('Meeting notes')
  })

  it('defaults content to empty string', () => {
    const result = transformNote(makeRaw())
    expect(result.content).toBe('')
  })

  it('maps contact_id when parentType is Contact', () => {
    const result = transformNote(makeRaw({ parentType: 'Contact', parentId: 'c1' }))
    expect(result.contact_id).toBe('c1')
  })

  it('maps company_id when parentType is Account', () => {
    const result = transformNote(makeRaw({ parentType: 'Account', parentId: 'acc1' }))
    expect(result.company_id).toBe('acc1')
  })

  it('maps deal_id when parentType is Opportunity', () => {
    const result = transformNote(makeRaw({ parentType: 'Opportunity', parentId: 'opp1' }))
    expect(result.deal_id).toBe('opp1')
  })

  it('maps owner_id from createdById', () => {
    const result = transformNote(makeRaw({ createdById: 'u1' }))
    expect(result.owner_id).toBe('u1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformNote({ content: 'Test note' })
    expect(result).toBeDefined()
    expect(result.post).toBe('Test note')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })

  it('reads the documented EspoCRM UTC datetimes ("YYYY-MM-DD HH:mm:ss") as ISO 8601', () => {
    const result = NoteSchema.parse(
      transformNote(
        makeRaw({ createdAt: '2026-11-29 12:34:56', modifiedAt: '2026-11-30 01:02:03' }),
      ),
    )
    expect(result.created_at).toBe('2026-11-29T12:34:56Z')
    expect(result.updated_at).toBe('2026-11-30T01:02:03Z')
  })
})
