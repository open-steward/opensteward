import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawMethodNote,
} from '../../../../../../../src/verticals/crm/adapters/method-crm/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawMethodNote> = {}): RawMethodNote {
  return {
    RecordId: '8',
    NoteText: 'Very important note',
    ContactRecordID: '7',
    OpportunityRecordID: '99',
    CreatedDate: '2026-01-15T09:30:00.000Z',
    ModifiedDate: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('method-crm transformNote', () => {
  it('maps RecordId to string id', () => {
    expect(transformNote(makeRaw({ RecordId: 8 })).id).toBe('8')
  })

  it('maps NoteText to content', () => {
    expect(transformNote(makeRaw()).content).toBe('Very important note')
  })

  it('falls back to Content when NoteText is absent', () => {
    const result = transformNote(makeRaw({ NoteText: undefined, Content: 'From content field' }))
    expect(result.content).toBe('From content field')
  })

  it('uses empty string when both NoteText and Content are absent', () => {
    expect(transformNote(makeRaw({ NoteText: undefined, Content: undefined })).content).toBe('')
  })

  it('maps ContactRecordID to contact_id string', () => {
    expect(transformNote(makeRaw({ ContactRecordID: 7 })).contact_id).toBe('7')
  })

  it('maps OpportunityRecordID to deal_id string', () => {
    expect(transformNote(makeRaw()).deal_id).toBe('99')
  })

  it('maps CreatedDate / ModifiedDate', () => {
    const result = transformNote(makeRaw())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('passes NoteSchema validation', () => {
    expect(() => NoteSchema.parse(transformNote(makeRaw()))).not.toThrow()
  })

  it('untransformNote maps content to NoteText', () => {
    expect(untransformNote({ content: 'Hello' }).NoteText).toBe('Hello')
  })

  it('untransformNote maps contact_id and deal_id', () => {
    const out = untransformNote({ contact_id: 'c1', deal_id: 'd2' })
    expect(out.ContactRecordID).toBe('c1')
    expect(out.OpportunityRecordID).toBe('d2')
  })
})
