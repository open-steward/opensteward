import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawNocrmNote,
} from '../../../../../../../src/verticals/crm/adapters/nocrm-io/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawNocrmNote> = {}): RawNocrmNote {
  return {
    id: 33,
    message: 'Discussed Q1 targets',
    user_id: 5,
    lead_id: 99,
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('nocrm-io transformNote', () => {
  it('maps id (number) to string id', () => {
    expect(transformNote(makeRaw({ id: 33 })).id).toBe('33')
  })

  it('maps message to content', () => {
    expect(transformNote(makeRaw()).content).toBe('Discussed Q1 targets')
  })

  it('uses empty string when message is null', () => {
    expect(transformNote(makeRaw({ message: null })).content).toBe('')
  })

  it('maps lead_id to deal_id string', () => {
    expect(transformNote(makeRaw({ lead_id: 99 })).deal_id).toBe('99')
  })

  it('maps user_id to owner_id string', () => {
    expect(transformNote(makeRaw({ user_id: 5 })).owner_id).toBe('5')
  })

  it('maps created_at / updated_at', () => {
    const result = transformNote(makeRaw())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('omits deal_id when lead_id is null', () => {
    expect(transformNote(makeRaw({ lead_id: null })).deal_id).toBeUndefined()
  })

  it('passes NoteSchema validation', () => {
    expect(() => NoteSchema.parse(transformNote(makeRaw()))).not.toThrow()
  })

  it('untransformNote maps content to message', () => {
    expect(untransformNote({ content: 'Hello' })['message']).toBe('Hello')
  })
})
