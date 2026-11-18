import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawVtigerNote } from '../../../../../../../src/verticals/crm/adapters/vtiger/transform/note'

function makeRaw(overrides: Partial<RawVtigerNote> = {}): RawVtigerNote {
  return { id: 'VTNOTE1', ...overrides }
}

describe('vtiger transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw()).id).toBe('VTNOTE1')
  })

  it('maps commentcontent to content', () => {
    expect(transformNote(makeRaw({ commentcontent: 'A note' })).content).toBe('A note')
  })

  it('sets contact_id when related_to is Contacts', () => {
    const result = transformNote(makeRaw({ related_to: 'Contacts', related_id: 'C1' }))
    expect(result.contact_id).toBe('C1')
    expect(result.deal_id).toBeUndefined()
  })

  it('sets deal_id when related_to is Potentials', () => {
    const result = transformNote(makeRaw({ related_to: 'Potentials', related_id: 'D1' }))
    expect(result.deal_id).toBe('D1')
    expect(result.contact_id).toBeUndefined()
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

describe('vtiger untransformNote', () => {
  it('maps content to commentcontent', () => {
    expect(untransformNote({ content: 'text' }).commentcontent).toBe('text')
  })

  it('maps contact_id to Contacts relation', () => {
    const result = untransformNote({ contact_id: 'C1' })
    expect(result.related_to).toBe('Contacts')
    expect(result.related_id).toBe('C1')
  })
})
