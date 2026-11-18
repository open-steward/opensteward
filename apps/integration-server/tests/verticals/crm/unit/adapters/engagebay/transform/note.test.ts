import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawEngageBayNote,
} from '../../../../../../../src/verticals/crm/adapters/engagebay/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawEngageBayNote> = {}): RawEngageBayNote {
  return { id: 1, ...overrides }
}

describe('engagebay transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: 12 })).id).toBe('12')
  })

  it('uses content field as content', () => {
    expect(transformNote(makeRaw({ content: 'Great call' })).content).toBe('Great call')
  })

  it('falls back to subject when content is absent', () => {
    expect(transformNote(makeRaw({ subject: 'Subject text' })).content).toBe('Subject text')
  })

  it('uses explicit contactId argument over parentId', () => {
    const raw = makeRaw({ parentId: 99 })
    expect(transformNote(raw, 'explicit-id').contact_id).toBe('explicit-id')
  })

  it('falls back to parentId string when contactId not provided', () => {
    expect(transformNote(makeRaw({ parentId: 99 })).contact_id).toBe('99')
  })

  it('maps owner_id to string', () => {
    expect(transformNote(makeRaw({ owner_id: 6 })).owner_id).toBe('6')
  })

  it('converts epoch ms timestamps to ISO datetime', () => {
    const raw = makeRaw({ created_time: 1699000000000, updated_time: 1700000000000 })
    const result = transformNote(raw)
    expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('passes NoteSchema validation with full input', () => {
    const raw: RawEngageBayNote = {
      id: 12,
      content: 'Great call with client.',
      parentId: 99,
      owner_id: 6,
      created_time: 1699000000000,
      updated_time: 1700000000000,
    }
    const result = transformNote(raw)
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('engagebay untransformNote', () => {
  it('maps content back to content', () => {
    expect(untransformNote({ content: 'Great call' }).content).toBe('Great call')
  })

  it('synthesizes subject from content', () => {
    const result = untransformNote({ content: 'A short note' })
    expect(result.subject).toBe('A short note')
  })

  it('truncates subject to 255 chars', () => {
    const long = 'x'.repeat(300)
    const result = untransformNote({ content: long })
    expect((result.subject as string).length).toBe(255)
  })

  it('converts contact_id to number for parentId', () => {
    expect(untransformNote({ contact_id: '99' }).parentId).toBe(99)
  })

  it('omits parentId when contact_id absent', () => {
    const result = untransformNote({ content: 'hi' })
    expect(result).not.toHaveProperty('parentId')
  })
})
