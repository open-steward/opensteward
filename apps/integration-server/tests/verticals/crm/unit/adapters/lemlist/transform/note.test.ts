import { describe, it, expect } from 'vitest'
import {
  transformNote,
  type RawLemlistNote,
} from '../../../../../../../src/verticals/crm/adapters/lemlist/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawLemlistNote> = {}): RawLemlistNote {
  return { _id: 'note_1', ...overrides }
}

describe('lemlist transformNote', () => {
  it('maps _id to string id', () => {
    expect(transformNote(makeRaw({ _id: 'note_42' })).id).toBe('note_42')
  })

  it('maps note to content', () => {
    expect(transformNote(makeRaw({ note: 'Great company' })).content).toBe('Great company')
  })

  it('defaults content to empty string when note is absent', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('maps companyId to company_id', () => {
    expect(transformNote(makeRaw({ companyId: 'co_5' })).company_id).toBe('co_5')
  })

  it('maps userId to owner_id', () => {
    expect(transformNote(makeRaw({ userId: 'user_3' })).owner_id).toBe('user_3')
  })

  it('maps createdAt to created_at', () => {
    expect(transformNote(makeRaw({ createdAt: '2026-01-01T00:00:00.000Z' })).created_at).toBe(
      '2026-01-01T00:00:00.000Z',
    )
  })

  it('maps updatedAt to updated_at', () => {
    expect(transformNote(makeRaw({ updatedAt: '2026-01-02T00:00:00.000Z' })).updated_at).toBe(
      '2026-01-02T00:00:00.000Z',
    )
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces a NoteSchema-valid result', () => {
    const raw = makeRaw({
      _id: 'note_1',
      note: 'Great company',
      companyId: 'co_5',
      userId: 'user_3',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
    expect(() => NoteSchema.parse(transformNote(raw))).not.toThrow()
  })
})
