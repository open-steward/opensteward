import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawCarerixNote,
} from '../../../../../../../src/verticals/crm/adapters/carerix/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawCarerixNote> = {}): RawCarerixNote {
  return { noteID: 1, noteText: 'Test note', ...overrides }
}

describe('carerix transformNote', () => {
  it('maps noteID to string id', () => {
    expect(transformNote(makeRaw({ noteID: 42 })).id).toBe('42')
  })

  it('falls back to id when noteID is absent', () => {
    expect(transformNote({ id: 77, noteText: 'hi' }).id).toBe('77')
  })

  it('maps noteText to content', () => {
    const result = transformNote(makeRaw({ noteText: 'Important note' }))
    expect(result.content).toBe('Important note')
  })

  it('defaults content to empty string when noteText is absent', () => {
    const result = transformNote({ noteID: 1 })
    expect(result.content).toBe('')
  })

  it('extracts contact_id from toEmployee object', () => {
    const result = transformNote(makeRaw({ toEmployee: { id: 10 } }))
    expect(result.contact_id).toBe('10')
  })

  it('extracts contact_id from toEmployee string', () => {
    const result = transformNote(makeRaw({ toEmployee: 'emp_5' }))
    expect(result.contact_id).toBe('emp_5')
  })

  it('extracts company_id from toCompany object', () => {
    const result = transformNote(makeRaw({ toCompany: { id: 20 } }))
    expect(result.company_id).toBe('20')
  })

  it('extracts owner_id from toUser object', () => {
    const result = transformNote(makeRaw({ toUser: { id: 3 } }))
    expect(result.owner_id).toBe('3')
  })

  it('maps dateCreated/dateModified to created_at/updated_at', () => {
    const result = transformNote(
      makeRaw({
        dateCreated: '2026-01-01T00:00:00.000Z',
        dateModified: '2026-02-01T00:00:00.000Z',
      }),
    )
    expect(result.created_at).toBe('2026-01-01T00:00:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T00:00:00.000Z')
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('produces output that passes NoteSchema.parse', () => {
    const raw = makeRaw({
      noteText: 'Meeting recap',
      toEmployee: { id: 10 },
      toCompany: { id: 20 },
      toUser: { id: 5 },
      dateCreated: '2026-01-01T00:00:00.000Z',
      dateModified: '2026-02-01T00:00:00.000Z',
    })
    expect(() => NoteSchema.parse(transformNote(raw))).not.toThrow()
  })
})

describe('carerix untransformNote', () => {
  it('maps content to noteText', () => {
    const result = untransformNote({ content: 'My note' })
    expect(result.noteText).toBe('My note')
  })

  it('maps contact_id to toEmployee', () => {
    const result = untransformNote({ contact_id: 'emp_1' })
    expect(result.toEmployee).toBe('emp_1')
  })

  it('maps company_id to toCompany', () => {
    const result = untransformNote({ company_id: 'co_2' })
    expect(result.toCompany).toBe('co_2')
  })

  it('maps owner_id to toUser', () => {
    const result = untransformNote({ owner_id: 'usr_3' })
    expect(result.toUser).toBe('usr_3')
  })

  it('omits undefined fields', () => {
    const result = untransformNote({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
