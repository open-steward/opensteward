import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  transformComment,
  untransformNote,
  type RawNetHuntNote,
} from '../../../../../../../src/verticals/crm/adapters/nethunt-crm/transform/note'
import { documentedComment } from '../fixtures'

function makeRaw(overrides: Partial<RawNetHuntNote> = {}): RawNetHuntNote {
  return { ...overrides }
}

describe('nethunt-crm transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: '9' })).id).toBe('9')
  })

  it('uses content field', () => {
    expect(transformNote(makeRaw({ content: 'Note content' })).content).toBe('Note content')
  })

  it('falls back to text field', () => {
    expect(transformNote(makeRaw({ text: 'Text fallback' })).content).toBe('Text fallback')
  })

  it('defaults content to empty string', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ id: '9' }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('nethunt-crm untransformNote', () => {
  it('maps content', () => {
    const result = untransformNote({ content: 'My note' })
    expect(result.content).toBe('My note')
  })
})

describe('nethunt-crm transformComment (CommentTimelineItem)', () => {
  it('maps the documented comment event and parses as a Note', () => {
    const raw = documentedComment()
    const out = NoteSchema.parse(transformComment(raw, { role: 'deal', recordId: 'rec-1' }))
    expect(out).toEqual({
      id: '5f8a2b1c3d4e5f6a7b8c9d0e',
      content: 'placeholder comment text',
      deal_id: 'rec-1',
      owner_id: 'jane@acme.com',
      created_at: '2025-03-18T10:00:00.000Z',
      metadata: raw,
    })
  })

  it.each([
    ['contact', 'contact_id'],
    ['company', 'company_id'],
    ['deal', 'deal_id'],
  ] as const)('attaches a %s parent to %s only', (role, key) => {
    const out = transformComment(documentedComment(), { role, recordId: 'r' })
    expect(out[key]).toBe('r')
    for (const other of ['contact_id', 'company_id', 'deal_id'] as const) {
      if (other !== key) expect(out[other]).toBeUndefined()
    }
  })

  it('omits owner_id when the creator is absent', () => {
    const out = NoteSchema.parse(
      transformComment(documentedComment({ creator: undefined }), {
        role: 'contact',
        recordId: 'r',
      }),
    )
    expect(out.owner_id).toBeUndefined()
  })

  it('refuses a comment without text rather than inventing content', () => {
    expect(() =>
      transformComment(documentedComment({ text: undefined }), { role: 'contact', recordId: 'r' }),
    ).toThrow(/has no text/)
  })
})
