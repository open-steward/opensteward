import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawDynamicsAnnotation } from '../../../../../../../src/verticals/crm/adapters/dynamics365-crm/transform/note'

function makeRaw(overrides: Partial<RawDynamicsAnnotation> = {}): RawDynamicsAnnotation {
  return { annotationid: 'ann1', ...overrides }
}

describe('dynamics365-crm transformNote', () => {
  it('maps annotationid to id', () => {
    expect(transformNote(makeRaw()).id).toBe('ann1')
  })

  it('maps content from notetext', () => {
    expect(transformNote(makeRaw({ notetext: 'Text' })).content).toBe('Text')
  })

  it('maps contact_id when objecttypecode is contact', () => {
    const result = transformNote(makeRaw({ objecttypecode: 'contact', _objectid_value: 'c1' }))
    expect(result.contact_id).toBe('c1')
    expect(result.deal_id).toBeUndefined()
  })

  it('maps deal_id when objecttypecode is opportunity', () => {
    const result = transformNote(makeRaw({ objecttypecode: 'opportunity', _objectid_value: 'd1' }))
    expect(result.deal_id).toBe('d1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('untransformNote maps notetext', () => {
    expect(untransformNote({ content: 'hi' }).notetext).toBe('hi')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
