import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawCrelateNote,
} from '../../../../../../../src/verticals/crm/adapters/crelate/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawCrelateNote> = {}): RawCrelateNote {
  return { id: 'note-1', body: 'A crelate note', ...overrides }
}

describe('crelate transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: 'note-77' })).id).toBe('note-77')
  })

  it('maps body to content', () => {
    expect(transformNote(makeRaw({ body: 'Follow up with client' })).content).toBe(
      'Follow up with client',
    )
  })

  it('defaults content to empty string when body absent', () => {
    expect(transformNote(makeRaw({ body: undefined })).content).toBe('')
  })

  it('picks primary owner from owners array', () => {
    const result = transformNote(
      makeRaw({
        owners: [
          { id: 'usr-1', is_primary: false },
          { id: 'usr-2', is_primary: true },
        ],
      }),
    )
    expect(result.owner_id).toBe('usr-2')
  })

  it('falls back to first owner when none is primary', () => {
    const result = transformNote(makeRaw({ owners: [{ id: 'usr-first' }] }))
    expect(result.owner_id).toBe('usr-first')
  })

  it('falls back to created_by_id when owners empty', () => {
    const result = transformNote(makeRaw({ owners: [], created_by_id: 'usr-creator' }))
    expect(result.owner_id).toBe('usr-creator')
  })

  it('converts created_on via toIsoDatetime', () => {
    const result = transformNote(makeRaw({ created_on: '2026-01-01T00:00:00.000Z' }))
    expect(result.created_at).toBe('2026-01-01T00:00:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces a NoteSchema-valid result', () => {
    const raw = makeRaw({
      body: 'Follow up',
      created_on: '2026-01-01T00:00:00.000Z',
    })
    expect(() => NoteSchema.parse(transformNote(raw))).not.toThrow()
  })
})

describe('crelate untransformNote', () => {
  it('maps content → body', () => {
    const out = untransformNote({ content: 'Follow up' })
    expect(out.body).toBe('Follow up')
  })

  it('round-trips body content', () => {
    const raw = makeRaw({ body: 'Important follow up' })
    const note = transformNote(raw)
    const back = untransformNote(note)
    expect(back.body).toBe('Important follow up')
  })
})
