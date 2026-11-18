import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawClozeNote,
} from '../../../../../../../src/verticals/crm/adapters/cloze/transform/note'

function makeRaw(overrides: Partial<RawClozeNote> = {}): RawClozeNote {
  return { ...overrides }
}

describe('cloze transformNote', () => {
  it('maps id from uniqueid field', () => {
    expect(transformNote(makeRaw({ uniqueid: 'note-uid-1' })).id).toBe('note-uid-1')
  })

  it('falls back to id field when uniqueid is absent', () => {
    expect(transformNote(makeRaw({ id: 'note-id-2' })).id).toBe('note-id-2')
  })

  it('returns empty string id when both uniqueid and id are absent', () => {
    expect(transformNote(makeRaw()).id).toBe('')
  })

  it('maps content from body field', () => {
    expect(transformNote(makeRaw({ body: 'Meeting went well.' })).content).toBe('Meeting went well.')
  })

  it('falls back to subject when body is absent', () => {
    expect(transformNote(makeRaw({ subject: 'Follow-up call' })).content).toBe('Follow-up call')
  })

  it('returns empty string content when both body and subject are absent', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('prefers body over subject for content', () => {
    const result = transformNote(makeRaw({ body: 'Body text', subject: 'Subject text' }))
    expect(result.content).toBe('Body text')
  })

  it('maps contact_id from person reference identifier', () => {
    const result = transformNote(
      makeRaw({
        references: [{ type: 'person', identifier: 'person-42' }],
      }),
    )
    expect(result.contact_id).toBe('person-42')
  })

  it('maps company_id from company reference identifier', () => {
    const result = transformNote(
      makeRaw({
        references: [{ type: 'company', identifier: 'company-99' }],
      }),
    )
    expect(result.company_id).toBe('company-99')
  })

  it('maps both contact_id and company_id when both references are present', () => {
    const result = transformNote(
      makeRaw({
        references: [
          { type: 'person', identifier: 'person-1' },
          { type: 'company', identifier: 'company-2' },
        ],
      }),
    )
    expect(result.contact_id).toBe('person-1')
    expect(result.company_id).toBe('company-2')
  })

  it('picks the first person reference when multiple exist', () => {
    const result = transformNote(
      makeRaw({
        references: [
          { type: 'person', identifier: 'person-first' },
          { type: 'person', identifier: 'person-second' },
        ],
      }),
    )
    expect(result.contact_id).toBe('person-first')
  })

  it('returns undefined contact_id when no person reference exists', () => {
    const result = transformNote(
      makeRaw({ references: [{ type: 'company', identifier: 'co-1' }] }),
    )
    expect(result.contact_id).toBeUndefined()
  })

  it('returns undefined company_id when no company reference exists', () => {
    const result = transformNote(
      makeRaw({ references: [{ type: 'person', identifier: 'p-1' }] }),
    )
    expect(result.company_id).toBeUndefined()
  })

  it('returns undefined contact_id and company_id when references is absent', () => {
    const result = transformNote(makeRaw())
    expect(result.contact_id).toBeUndefined()
    expect(result.company_id).toBeUndefined()
  })

  it('maps owner_id from from field', () => {
    expect(transformNote(makeRaw({ from: 'user@example.com' })).owner_id).toBe('user@example.com')
  })

  it('maps created_at from ISO string date field', () => {
    const result = transformNote(makeRaw({ date: '2024-04-22T14:00:00.000Z' }))
    expect(result.created_at).toBe('2024-04-22T14:00:00.000Z')
  })

  it('sets created_at to undefined when date is absent', () => {
    expect(transformNote(makeRaw()).created_at).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ uniqueid: 'note-uid-1' }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('cloze untransformNote', () => {
  it('always includes style: note', () => {
    expect(untransformNote({}).style).toBe('note')
    expect(untransformNote({ content: 'Hello' }).style).toBe('note')
  })

  it('maps content to body', () => {
    const result = untransformNote({ content: 'Important note.' })
    expect(result.body).toBe('Important note.')
  })

  it('maps owner_id to from', () => {
    const result = untransformNote({ owner_id: 'agent@example.com' })
    expect(result.from).toBe('agent@example.com')
  })

  it('builds references array with person entry for contact_id', () => {
    const result = untransformNote({ contact_id: 'person-7' })
    expect(result.references).toEqual([{ type: 'person', identifier: 'person-7' }])
  })

  it('builds references array with company entry for company_id', () => {
    const result = untransformNote({ company_id: 'company-3' })
    expect(result.references).toEqual([{ type: 'company', identifier: 'company-3' }])
  })

  it('builds references array with both person and company entries', () => {
    const result = untransformNote({ contact_id: 'p-1', company_id: 'c-2' })
    expect(result.references).toEqual([
      { type: 'person', identifier: 'p-1' },
      { type: 'company', identifier: 'c-2' },
    ])
  })

  it('omits references when neither contact_id nor company_id is provided', () => {
    const result = untransformNote({ content: 'standalone note' })
    expect(result.references).toBeUndefined()
  })
})
