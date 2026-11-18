import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawTeamwaveNote } from '../../../../../../../src/verticals/crm/adapters/teamwave/transform/note'

function makeRaw(overrides: Partial<RawTeamwaveNote> = {}): RawTeamwaveNote {
  return { id: 8, content: 'Note content', ...overrides }
}

describe('teamwave transformNote', () => {
  it('maps id and content', () => {
    const result = transformNote(makeRaw())
    expect(result.id).toBe('8')
    expect(result.content).toBe('Note content')
  })

  it('maps organization_id to company_id', () => {
    expect(transformNote(makeRaw({ organization_id: 2 })).company_id).toBe('2')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('teamwave untransformNote', () => {
  it('converts company_id to numeric organization_id', () => {
    expect(untransformNote({ content: 'text', company_id: '6' }).organization_id).toBe(6)
  })
})
