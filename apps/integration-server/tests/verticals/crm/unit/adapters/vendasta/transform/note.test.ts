import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawVendastaNote,
} from '../../../../../../../src/verticals/crm/adapters/vendasta/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawVendastaNote> = {}): RawVendastaNote {
  return {
    crmObjectId: 'note_001',
    ownerId: 'usr_owner',
    created: '2026-01-15T09:30:00.000Z',
    updated: '2026-02-01T14:20:00.000Z',
    fields: [
      { fieldId: 'standard__activity_note', stringValue: 'Follow up on Q1 expansion' },
      { fieldId: 'system__activity_source_id', stringValue: 'cont_jane' },
      { fieldId: 'system__activity_owner_id', stringValue: 'usr_fallback' },
    ],
    ...overrides,
  }
}

describe('vendasta transformNote', () => {
  it('maps id from crmObjectId', () => {
    expect(transformNote(makeRaw()).id).toBe('note_001')
  })

  it('falls back to system__activity_id field when crmObjectId absent', () => {
    const raw = makeRaw({
      crmObjectId: undefined,
      fields: [{ fieldId: 'system__activity_id', stringValue: 'note_field_id' }],
    })
    expect(transformNote(raw).id).toBe('note_field_id')
  })

  it('maps content from standard__activity_note field', () => {
    expect(transformNote(makeRaw()).content).toBe('Follow up on Q1 expansion')
  })

  it('maps contact_id from system__activity_source_id field', () => {
    expect(transformNote(makeRaw()).contact_id).toBe('cont_jane')
  })

  it('prefers raw.ownerId over system__activity_owner_id field', () => {
    expect(transformNote(makeRaw()).owner_id).toBe('usr_owner')
  })

  it('falls back to system__activity_owner_id field when ownerId absent', () => {
    const raw = makeRaw({
      ownerId: undefined,
      fields: [{ fieldId: 'system__activity_owner_id', stringValue: 'usr_fallback' }],
    })
    expect(transformNote(raw).owner_id).toBe('usr_fallback')
  })

  it('maps timestamps from raw.created and raw.updated', () => {
    const result = transformNote(makeRaw())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('preserves raw as metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => NoteSchema.parse(transformNote(makeRaw()))).not.toThrow()
  })

  it('content is empty string when standard__activity_note absent', () => {
    const raw = makeRaw({ fields: [] })
    expect(transformNote(raw).content).toBe('')
  })
})

describe('vendasta untransformNote', () => {
  it('maps content to standard__activity_note field', () => {
    const fields = untransformNote({ content: 'My note body' })
    const found = fields.find((f) => f.fieldId === 'standard__activity_note')
    expect(found?.stringValue).toBe('My note body')
  })

  it('always pushes activity_type=note field', () => {
    const fields = untransformNote({})
    const found = fields.find((f) => f.fieldId === 'system__activity_activity_type')
    expect(found?.stringValue).toBe('note')
  })

  it('maps contact_id to system__activity_source_id field', () => {
    const fields = untransformNote({ contact_id: 'cont_jane' })
    const found = fields.find((f) => f.fieldId === 'system__activity_source_id')
    expect(found?.stringValue).toBe('cont_jane')
  })
})
