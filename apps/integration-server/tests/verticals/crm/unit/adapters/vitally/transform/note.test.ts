import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawVitallyNote,
} from '../../../../../../../src/verticals/crm/adapters/vitally/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawVitallyNote> = {}): RawVitallyNote {
  return {
    id: 'note_001',
    note: 'Follow up on Q1 expansion',
    subject: 'Q1 Expansion Note',
    authorId: 'usr_author',
    accountId: 'acc_001',
    createdAt: '2026-01-15T09:30:00.000Z',
    updatedAt: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('vitally transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw()).id).toBe('note_001')
  })

  it('maps note field to content', () => {
    expect(transformNote(makeRaw()).content).toBe('Follow up on Q1 expansion')
  })

  it('falls back to subject when note is null', () => {
    const raw = makeRaw({ note: null })
    expect(transformNote(raw).content).toBe('Q1 Expansion Note')
  })

  it('content is empty string when both note and subject are null', () => {
    const raw = makeRaw({ note: null, subject: null })
    expect(transformNote(raw).content).toBe('')
  })

  it('maps accountId to company_id', () => {
    expect(transformNote(makeRaw()).company_id).toBe('acc_001')
  })

  it('maps authorId to owner_id', () => {
    expect(transformNote(makeRaw()).owner_id).toBe('usr_author')
  })

  it('company_id is undefined when accountId is not a string', () => {
    expect(transformNote(makeRaw({ accountId: null })).company_id).toBeUndefined()
  })

  it('maps createdAt to created_at', () => {
    expect(transformNote(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('maps updatedAt to updated_at', () => {
    expect(transformNote(makeRaw()).updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('preserves raw as metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => NoteSchema.parse(transformNote(makeRaw()))).not.toThrow()
  })

  it('handles minimal input without throwing', () => {
    const minimal: RawVitallyNote = { id: 'note_min' }
    expect(() => NoteSchema.parse(transformNote(minimal))).not.toThrow()
  })
})

describe('vitally untransformNote', () => {
  it('maps content to note', () => {
    const out = untransformNote({ content: 'My note' })
    expect(out.note).toBe('My note')
  })

  it('maps company_id to accountId', () => {
    const out = untransformNote({ company_id: 'acc_001' })
    expect(out.accountId).toBe('acc_001')
  })
})
