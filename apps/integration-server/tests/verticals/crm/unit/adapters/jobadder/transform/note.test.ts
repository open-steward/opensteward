import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  parseNoteCompoundId,
  type RawJobAdderNote,
  type NoteParentContext,
} from '../../../../../../../src/verticals/crm/adapters/jobadder/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawJobAdderNote> = {}): RawJobAdderNote {
  return { noteId: 10, ...overrides }
}

describe('jobadder transformNote', () => {
  it('builds compound id from inline candidate', () => {
    const raw = makeRaw({ noteId: 10, candidate: { candidateId: 5 } })
    expect(transformNote(raw).id).toBe('candidate:5:10')
  })

  it('builds compound id from inline job', () => {
    const raw = makeRaw({ noteId: 10, job: { jobId: 99 } })
    expect(transformNote(raw).id).toBe('job:99:10')
  })

  it('builds compound id from parentCtx when no inline parent', () => {
    const ctx: NoteParentContext = { parentType: 'candidate', parentId: '7' }
    expect(transformNote(makeRaw({ noteId: 10 }), ctx).id).toBe('candidate:7:10')
  })

  it('falls back to plain noteId when no parent context', () => {
    expect(transformNote(makeRaw({ noteId: 10 })).id).toBe('10')
  })

  it('maps text to content', () => {
    expect(transformNote(makeRaw({ text: 'Great candidate' })).content).toBe('Great candidate')
  })

  it('maps candidate.candidateId to contact_id', () => {
    expect(transformNote(makeRaw({ candidate: { candidateId: 5 } })).contact_id).toBe('5')
  })

  it('maps job.jobId to deal_id', () => {
    expect(transformNote(makeRaw({ job: { jobId: 99 } })).deal_id).toBe('99')
  })

  it('maps createdBy.userId to owner_id', () => {
    expect(transformNote(makeRaw({ createdBy: { userId: 3 } })).owner_id).toBe('3')
  })

  it('maps createdAt to created_at', () => {
    expect(transformNote(makeRaw({ createdAt: '2026-01-01T00:00:00.000Z' })).created_at).toBe(
      '2026-01-01T00:00:00.000Z',
    )
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces a NoteSchema-valid result', () => {
    const raw = makeRaw({
      noteId: 10,
      text: 'Great candidate',
      candidate: { candidateId: 5 },
      createdBy: { userId: 3 },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
    expect(() => NoteSchema.parse(transformNote(raw))).not.toThrow()
  })
})

describe('jobadder parseNoteCompoundId', () => {
  it('parses candidate compound id', () => {
    expect(parseNoteCompoundId('candidate:5:10')).toEqual({
      parentType: 'candidate',
      parentId: '5',
      noteId: '10',
    })
  })

  it('parses job compound id', () => {
    expect(parseNoteCompoundId('job:99:10')).toEqual({
      parentType: 'job',
      parentId: '99',
      noteId: '10',
    })
  })

  it('returns null for plain note id', () => {
    expect(parseNoteCompoundId('10')).toBeNull()
  })

  it('returns null for unknown parent type', () => {
    expect(parseNoteCompoundId('company:5:10')).toBeNull()
  })
})

describe('jobadder untransformNote', () => {
  it('maps content to text', () => {
    expect(untransformNote({ content: 'Great candidate' }).text).toBe('Great candidate')
  })

  it('round-trips content', () => {
    const canonical = transformNote(
      makeRaw({ text: 'Great candidate', candidate: { candidateId: 5 } }),
    )
    const wire = untransformNote(canonical)
    expect(wire.text).toBe('Great candidate')
  })
})
