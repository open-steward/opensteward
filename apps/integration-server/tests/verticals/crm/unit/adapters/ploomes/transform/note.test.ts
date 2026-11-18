import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
} from '../../../../../../../src/verticals/crm/adapters/ploomes/transform/note'
import type { RawPloomesNote } from '../../../../../../../src/verticals/crm/adapters/ploomes/transform/note'

/**
 * Built from the documented InteractionRecords example body
 * (https://developers.ploomes.com/json/openapi.json):
 *   {"ContactId": 23, "DealId": null, "Date": "2023-01-17T21:31:28.69-03:00",
 *    "Content": "Comentário aleatório", "TypeId": 1, ...}
 * plus the documented Id.
 */
function makeRaw(overrides: Partial<RawPloomesNote> = {}): RawPloomesNote {
  return {
    Id: 901,
    ContactId: 23,
    DealId: null,
    Date: '2023-01-17T21:31:28.69-03:00',
    Content: 'Comentário aleatório',
    TypeId: 1,
    ...overrides,
  }
}

describe('ploomes transformNote', () => {
  it('parses against the canonical schema', () => {
    expect(() => NoteSchema.parse(transformNote(makeRaw()))).not.toThrow()
  })
  it('maps Id, Content and ContactId', () => {
    const n = transformNote(makeRaw())
    expect(n.id).toBe('901')
    expect(n.content).toBe('Comentário aleatório')
    expect(n.contact_id).toBe('23')
  })
  it('maps DealId when present, and omits it when null', () => {
    expect(transformNote(makeRaw({ DealId: 77 })).deal_id).toBe('77')
    expect(transformNote(makeRaw()).deal_id).toBeUndefined()
  })
  it('does not pass the record Date off as created_at', () => {
    expect(transformNote(makeRaw()).created_at).toBeUndefined()
  })
  it('throws on a record without the required Content rather than inventing one', () => {
    expect(() => transformNote(makeRaw({ Content: undefined }))).toThrow(/Content/)
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    expect(untransformNote({ content: 'Test note' }).Content).toBe('Test note')
  })
})
