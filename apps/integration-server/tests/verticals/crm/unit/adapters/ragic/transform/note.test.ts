import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
} from '../../../../../../../src/verticals/crm/adapters/ragic/transform/note'
import type { RagicRecord } from '../../../../../../../src/verticals/crm/adapters/ragic/client'

function makeRaw(overrides: Partial<RagicRecord> = {}): RagicRecord {
  return { _ragic_id: 1, ...overrides }
}

describe('ragic transformNote', () => {
  it('maps _ragic_id to id string', () => {
    expect(transformNote(makeRaw({ _ragic_id: 5 })).id).toBe('5')
  })

  it('maps Content field', () => {
    expect(transformNote(makeRaw({ 'Content': 'A note' })).content).toBe('A note')
  })

  it('maps Contact ID field to contact_id', () => {
    expect(transformNote(makeRaw({ 'Contact ID': 'c1' })).contact_id).toBe('c1')
  })

  it('handles empty record gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ _ragic_id: 5 }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('ragic untransformNote', () => {
  it('maps content to "Content" field key', () => {
    const result = untransformNote({ content: 'A note' })
    expect(result['Content']).toBe('A note')
  })
})
