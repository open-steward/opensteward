import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawJobdivaNote,
} from '../../../../../../../src/verticals/crm/adapters/jobdiva/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawJobdivaNote> = {}): RawJobdivaNote {
  return { noteid: '10', notetext: 'Hello', ...overrides }
}

describe('jobdiva transformNote', () => {
  it('maps noteid to string id (primary)', () => {
    expect(transformNote(makeRaw({ noteid: '42' })).id).toBe('42')
  })

  it('falls back to id when noteid absent', () => {
    expect(transformNote({ id: '7', notetext: 'Hi' }).id).toBe('7')
  })

  it('maps notetext to content', () => {
    expect(transformNote(makeRaw({ notetext: 'Great candidate' })).content).toBe('Great candidate')
  })

  it('falls back to note field for content', () => {
    expect(transformNote({ noteid: '1', note: 'Fallback note' }).content).toBe('Fallback note')
  })

  it('falls back to content field', () => {
    expect(transformNote({ noteid: '1', content: 'Content field' }).content).toBe('Content field')
  })

  it('maps candidateid to contact_id', () => {
    expect(transformNote(makeRaw({ candidateid: '5' })).contact_id).toBe('5')
  })

  it('falls back to contactid when candidateid absent', () => {
    expect(transformNote({ noteid: '1', notetext: 'Hi', contactid: '6' }).contact_id).toBe('6')
  })

  it('maps jobid to deal_id', () => {
    expect(transformNote(makeRaw({ jobid: '20' })).deal_id).toBe('20')
  })

  it('maps ownerid to owner_id', () => {
    expect(transformNote(makeRaw({ ownerid: '3' })).owner_id).toBe('3')
  })

  it('maps createdat to created_at', () => {
    expect(transformNote(makeRaw({ createdat: '2026-01-01T00:00:00.000Z' })).created_at).toBe(
      '2026-01-01T00:00:00.000Z',
    )
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces a NoteSchema-valid result', () => {
    const raw = makeRaw({
      noteid: '10',
      notetext: 'Great candidate',
      candidateid: '5',
      jobid: '20',
      ownerid: '3',
      createdat: '2026-01-01T00:00:00.000Z',
      modifiedat: '2026-01-02T00:00:00.000Z',
    })
    expect(() => NoteSchema.parse(transformNote(raw))).not.toThrow()
  })
})

describe('jobdiva untransformNote', () => {
  it('maps content to notetext', () => {
    expect(untransformNote({ content: 'Great candidate' }).notetext).toBe('Great candidate')
  })

  it('maps contact_id to candidateid', () => {
    expect(untransformNote({ contact_id: '5' }).candidateid).toBe('5')
  })

  it('maps deal_id to jobid', () => {
    expect(untransformNote({ deal_id: '20' }).jobid).toBe('20')
  })

  it('round-trips content, contact_id, deal_id', () => {
    const canonical = transformNote(
      makeRaw({ notetext: 'Great candidate', candidateid: '5', jobid: '20' }),
    )
    const wire = untransformNote(canonical)
    expect(wire.notetext).toBe('Great candidate')
    expect(wire.candidateid).toBe('5')
    expect(wire.jobid).toBe('20')
  })
})
