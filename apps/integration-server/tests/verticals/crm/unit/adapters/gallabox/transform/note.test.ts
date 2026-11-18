import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  type RawGallaboxNote,
} from '../../../../../../../src/verticals/crm/adapters/gallabox/transform/note'

function makeRaw(overrides: Partial<RawGallaboxNote> = {}): RawGallaboxNote {
  return { id: 'n-1', ...overrides }
}

describe('gallabox transformNote', () => {
  it('maps string id to string', () => {
    expect(transformNote(makeRaw({ id: 'n-99' })).id).toBe('n-99')
  })

  it('maps numeric id to string', () => {
    expect(transformNote(makeRaw({ id: 3 })).id).toBe('3')
  })

  it('maps content when present', () => {
    expect(transformNote(makeRaw({ content: 'Called the client.' })).content).toBe(
      'Called the client.',
    )
  })

  it('falls back to empty string when content is absent', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('does not throw on minimal input', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ id: 'n-99' }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
