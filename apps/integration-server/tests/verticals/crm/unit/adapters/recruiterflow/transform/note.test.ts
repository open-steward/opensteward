import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawRecruiterflowNote,
} from '../../../../../../../src/verticals/crm/adapters/recruiterflow/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawRecruiterflowNote> = {}): RawRecruiterflowNote {
  return {
    id: 'note-5',
    content: 'Candidate showed strong technical skills',
    candidate_id: 'cand-42',
    client_id: 'client-7',
    owner_id: 'usr-1',
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-01-20T12:00:00.000Z',
    ...overrides,
  }
}

describe('recruiterflow transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('note-5')
  })

  it('maps content', () => {
    expect(transformNote(makeRaw()).content).toBe('Candidate showed strong technical skills')
  })

  it('maps contact_id from candidate_id', () => {
    expect(transformNote(makeRaw()).contact_id).toBe('cand-42')
  })

  it('maps company_id from client_id', () => {
    expect(transformNote(makeRaw()).company_id).toBe('client-7')
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

  it('returns undefined contact_id when candidate_id absent', () => {
    expect(transformNote(makeRaw({ candidate_id: undefined })).contact_id).toBeUndefined()
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

  it('untransformNote maps contact_id to candidate_id', () => {
    expect(untransformNote({ contact_id: 'cand-42' }).candidate_id).toBe('cand-42')
  })

  it('untransformNote maps company_id to client_id', () => {
    expect(untransformNote({ company_id: 'client-7' }).client_id).toBe('client-7')
  })
})
