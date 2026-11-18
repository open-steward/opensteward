import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawOnePageCrmNote,
} from '../../../../../../../src/verticals/crm/adapters/onepagecrm/transform/note'

function makeRaw(overrides: Partial<RawOnePageCrmNote> = {}): RawOnePageCrmNote {
  return { id: '1', ...overrides }
}

describe('onepagecrm transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: '3' })).id).toBe('3')
  })

  it('maps content from text', () => {
    expect(transformNote(makeRaw({ text: 'A note' })).content).toBe('A note')
  })

  it('maps contact_id and deal_id', () => {
    const result = transformNote(makeRaw({ contact_id: 'c1', deal_id: 'd1' }))
    expect(result.contact_id).toBe('c1')
    expect(result.deal_id).toBe('d1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ id: '3' }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('onepagecrm untransformNote', () => {
  it('maps content to text', () => {
    const result = untransformNote({ content: 'A note' })
    expect(result['text']).toBe('A note')
  })
})
