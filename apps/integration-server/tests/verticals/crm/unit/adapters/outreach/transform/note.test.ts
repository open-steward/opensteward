import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawOutreachNote,
} from '../../../../../../../src/verticals/crm/adapters/outreach/transform/note'

function makeRaw(overrides: Partial<RawOutreachNote> = {}): RawOutreachNote {
  return {
    id: '1',
    type: 'note',
    attributes: {},
    ...overrides,
  }
}

describe('outreach transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: '5' })).id).toBe('5')
  })

  it('maps content from attributes', () => {
    expect(transformNote(makeRaw({ attributes: { content: 'A note' } })).content).toBe('A note')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ id: '5' }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('outreach untransformNote', () => {
  it('wraps content in data envelope with type note', () => {
    const result = untransformNote({ content: 'Hello' })
    const data = result.data as Record<string, unknown>
    expect(data?.['type']).toBe('note')
    expect((data?.['attributes'] as Record<string, unknown>)?.['content']).toBe('Hello')
  })
})
