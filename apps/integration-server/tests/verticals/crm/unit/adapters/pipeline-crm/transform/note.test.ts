import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawPipelineCrmNote,
} from '../../../../../../../src/verticals/crm/adapters/pipeline-crm/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawPipelineCrmNote> = {}): RawPipelineCrmNote {
  return {
    id: 'note-5',
    content: 'Follow up on Q1 expansion',
    person_id: 'p-42',
    company_id: 'co-7',
    deal_id: 'd-99',
    owner_id: 'usr-1',
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-01-20T12:00:00.000Z',
    ...overrides,
  }
}

describe('pipeline-crm transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('note-5')
  })

  it('maps content', () => {
    expect(transformNote(makeRaw()).content).toBe('Follow up on Q1 expansion')
  })

  it('maps contact_id from person_id', () => {
    expect(transformNote(makeRaw()).contact_id).toBe('p-42')
  })

  it('maps company_id', () => {
    expect(transformNote(makeRaw()).company_id).toBe('co-7')
  })

  it('maps deal_id', () => {
    expect(transformNote(makeRaw()).deal_id).toBe('d-99')
  })

  it('maps owner_id', () => {
    expect(transformNote(makeRaw()).owner_id).toBe('usr-1')
  })

  it('maps created_at as ISO datetime', () => {
    expect(transformNote(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('maps updated_at as ISO datetime', () => {
    expect(transformNote(makeRaw()).updated_at).toBe('2026-01-20T12:00:00.000Z')
  })

  it('passes NoteSchema validation', () => {
    expect(() => NoteSchema.parse(transformNote(makeRaw()))).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('untransformNote round-trips content', () => {
    expect(untransformNote({ content: 'Hello world' }).content).toBe('Hello world')
  })

  it('untransformNote maps contact_id to person_id', () => {
    expect(untransformNote({ contact_id: 'p-42' }).person_id).toBe('p-42')
  })
})
