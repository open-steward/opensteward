import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawHighLevelNote,
} from '../../../../../../../src/verticals/crm/adapters/highlevel/transform/note'

function makeRaw(overrides: Partial<RawHighLevelNote> = {}): RawHighLevelNote {
  return { id: 'n-1', ...overrides }
}

describe('highlevel transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw({ id: 'n-1' })).id).toBe('n-1')
  })

  it('maps body to content', () => {
    expect(transformNote(makeRaw({ body: 'Hello' })).content).toBe('Hello')
  })

  it('defaults content to empty string', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('uses passed contactId when contactId field missing', () => {
    const result = transformNote(makeRaw(), 'c-2')
    expect(result.contact_id).toBe('c-2')
  })

  it('prefers raw contactId over passed contactId', () => {
    const result = transformNote(makeRaw({ contactId: 'c-3' }), 'c-2')
    expect(result.contact_id).toBe('c-3')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ id: 'n-1' }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('highlevel untransformNote', () => {
  it('maps content to body', () => {
    const result = untransformNote({ content: 'Test note' })
    expect(result.body).toBe('Test note')
  })
})
