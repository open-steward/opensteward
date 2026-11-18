import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawSalesforceNote } from '../../../../../../../src/verticals/crm/adapters/salesforce/transform/note'

function makeRaw(overrides: Partial<RawSalesforceNote> = {}): RawSalesforceNote {
  return { Id: 'NOTE001', ...overrides }
}

describe('salesforce transformNote', () => {
  it('maps Id to id', () => {
    expect(transformNote(makeRaw()).id).toBe('NOTE001')
  })

  it('uses Body as content', () => {
    expect(transformNote(makeRaw({ Body: 'Some note' })).content).toBe('Some note')
  })

  it('falls back to Title when Body is absent', () => {
    expect(transformNote(makeRaw({ Title: 'Title only' })).content).toBe('Title only')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('salesforce untransformNote', () => {
  it('maps content to Body', () => {
    expect(untransformNote({ content: 'Note body' }).Body).toBe('Note body')
  })

  it('maps contact_id to ParentId', () => {
    expect(untransformNote({ contact_id: 'C1' }).ParentId).toBe('C1')
  })
})
