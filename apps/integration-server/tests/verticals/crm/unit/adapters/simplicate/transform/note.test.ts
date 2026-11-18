import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawSimplicateNote,
} from '../../../../../../../src/verticals/crm/adapters/simplicate/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawSimplicateNote> = {}): RawSimplicateNote {
  return { id: 'note:aabb1122', ...overrides }
}

describe('simplicate transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: 'note:xyz' })).id).toBe('note:xyz')
  })

  it('maps content, falling back to empty string', () => {
    expect(transformNote(makeRaw({ content: 'Follow up' })).content).toBe('Follow up')
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('maps person_id to contact_id', () => {
    expect(transformNote(makeRaw({ person_id: 'person:p1' })).contact_id).toBe('person:p1')
  })

  it('maps organization_id to company_id', () => {
    expect(transformNote(makeRaw({ organization_id: 'organization:o1' })).company_id).toBe(
      'organization:o1',
    )
  })

  it('maps created_at and updated_at as-is', () => {
    const result = transformNote(
      makeRaw({
        created_at: '2024-04-01T07:00:00+00:00',
        updated_at: '2024-07-01T07:00:00+00:00',
      }),
    )
    expect(result.created_at).toBe('2024-04-01T07:00:00+00:00')
    expect(result.updated_at).toBe('2024-07-01T07:00:00+00:00')
  })

  it('preserves raw metadata', () => {
    const raw = makeRaw({ content: 'Hello' })
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const raw: RawSimplicateNote = {
      id: 'note:nn001122',
      content: 'Client requested expedited delivery',
      person_id: 'person:p1',
      organization_id: 'organization:o1',
      created_at: '2025-01-15T09:00:00+00:00',
      updated_at: '2025-01-20T12:00:00+00:00',
    }
    expect(() => NoteSchema.parse(transformNote(raw))).not.toThrow()
  })
})

describe('simplicate untransformNote', () => {
  it('maps content', () => {
    expect(untransformNote({ content: 'Body' })).toMatchObject({ content: 'Body' })
  })

  it('maps contact_id to person_id', () => {
    expect(untransformNote({ contact_id: 'person:p3' })).toMatchObject({ person_id: 'person:p3' })
  })

  it('maps company_id to organization_id', () => {
    expect(untransformNote({ company_id: 'organization:o5' })).toMatchObject({
      organization_id: 'organization:o5',
    })
  })

  it('omits unset fields', () => {
    expect(Object.keys(untransformNote({}))).toHaveLength(0)
  })
})
