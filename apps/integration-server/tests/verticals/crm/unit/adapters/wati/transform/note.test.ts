import { describe, it, expect } from 'vitest'
import {
  transformNote,
  type RawWatiNote,
} from '../../../../../../../src/verticals/crm/adapters/wati/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

describe('wati transformNote (stub)', () => {
  it('maps id to string', () => {
    const raw: RawWatiNote = { id: 'note_001', content: 'My note' }
    expect(transformNote(raw).id).toBe('note_001')
  })

  it('converts numeric id to string', () => {
    const raw: RawWatiNote = { id: 42 }
    expect(transformNote(raw).id).toBe('42')
  })

  it('maps content', () => {
    const raw: RawWatiNote = { id: 'note_001', content: 'My note' }
    expect(transformNote(raw).content).toBe('My note')
  })

  it('content defaults to empty string when absent', () => {
    const raw: RawWatiNote = { id: 'note_001' }
    expect(transformNote(raw).content).toBe('')
  })

  it('preserves raw as metadata by reference', () => {
    const raw: RawWatiNote = { id: 'note_001', content: 'My note' }
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const raw: RawWatiNote = { id: 'note_001', content: 'My note' }
    expect(() => NoteSchema.parse(transformNote(raw))).not.toThrow()
  })
})
