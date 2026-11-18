import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawClarifyNote,
} from '../../../../../../../src/verticals/crm/adapters/clarify/transform/note'

function makeRaw(overrides: Partial<RawClarifyNote> = {}): RawClarifyNote {
  return { id: 'n-1', ...overrides }
}

describe('clarify transformNote', () => {
  it('maps id to string (string id)', () => {
    expect(transformNote(makeRaw({ id: 'n-42' })).id).toBe('n-42')
  })

  it('maps id to string (numeric id)', () => {
    expect(transformNote(makeRaw({ id: 99 })).id).toBe('99')
  })

  it('maps body to content', () => {
    const result = transformNote(makeRaw({ body: 'Great meeting!' }))
    expect(result.content).toBe('Great meeting!')
  })

  it('defaults content to empty string when body is absent', () => {
    const result = transformNote(makeRaw())
    expect(result.content).toBe('')
  })

  it('sets contact_id when entity_type is "person"', () => {
    const result = transformNote(
      makeRaw({ entity_type: 'person', entity_id: 'p-7' }),
    )
    expect(result.contact_id).toBe('p-7')
    expect(result.company_id).toBeUndefined()
    expect(result.deal_id).toBeUndefined()
  })

  it('sets company_id when entity_type is "company"', () => {
    const result = transformNote(
      makeRaw({ entity_type: 'company', entity_id: 'co-3' }),
    )
    expect(result.company_id).toBe('co-3')
    expect(result.contact_id).toBeUndefined()
    expect(result.deal_id).toBeUndefined()
  })

  it('sets deal_id when entity_type is "deal"', () => {
    const result = transformNote(
      makeRaw({ entity_type: 'deal', entity_id: 'd-5' }),
    )
    expect(result.deal_id).toBe('d-5')
    expect(result.contact_id).toBeUndefined()
    expect(result.company_id).toBeUndefined()
  })

  it('all entity fields are undefined when entity_type is absent', () => {
    const result = transformNote(makeRaw({ entity_id: 'x-1' }))
    expect(result.contact_id).toBeUndefined()
    expect(result.company_id).toBeUndefined()
    expect(result.deal_id).toBeUndefined()
  })

  it('maps owner_id and timestamps', () => {
    const result = transformNote(
      makeRaw({
        owner_id: 'u-2',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-06-01T00:00:00Z',
      }),
    )
    expect(result.owner_id).toBe('u-2')
    expect(result.created_at).toBe('2024-01-01T00:00:00Z')
    expect(result.updated_at).toBe('2024-06-01T00:00:00Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ id: 'n-42' }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('clarify untransformNote', () => {
  it('maps content to body', () => {
    const result = untransformNote({ content: 'Follow-up note' })
    expect(result.body).toBe('Follow-up note')
  })

  it('sets entity_id and entity_type "person" from contact_id', () => {
    const result = untransformNote({ contact_id: 'p-10' })
    expect(result.entity_id).toBe('p-10')
    expect(result.entity_type).toBe('person')
    expect(result).not.toHaveProperty('company_id')
  })

  it('sets entity_id and entity_type "company" from company_id', () => {
    const result = untransformNote({ company_id: 'co-4' })
    expect(result.entity_id).toBe('co-4')
    expect(result.entity_type).toBe('company')
  })

  it('sets entity_id and entity_type "deal" from deal_id', () => {
    const result = untransformNote({ deal_id: 'd-8' })
    expect(result.entity_id).toBe('d-8')
    expect(result.entity_type).toBe('deal')
  })

  it('prefers contact_id over company_id and deal_id', () => {
    const result = untransformNote({ contact_id: 'p-1', company_id: 'co-2', deal_id: 'd-3' })
    expect(result.entity_type).toBe('person')
    expect(result.entity_id).toBe('p-1')
  })

  it('returns empty object when no fields provided', () => {
    const result = untransformNote({})
    expect(result).toEqual({})
  })
})
