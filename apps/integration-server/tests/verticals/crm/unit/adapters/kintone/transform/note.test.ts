import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
} from '../../../../../../../src/verticals/crm/adapters/kintone/transform/note'
import type { KintoneRecord } from '../../../../../../../src/verticals/crm/adapters/kintone/client'

function makeRaw(extra: Record<string, { value: unknown }> = {}): KintoneRecord {
  return {
    $id: { value: '8' },
    $revision: { value: '1' },
    ...extra,
  }
}

describe('kintone transformNote', () => {
  it('maps $id to id', () => {
    expect(transformNote(makeRaw()).id).toBe('8')
  })

  it('maps content field', () => {
    const result = transformNote(makeRaw({ content: { value: 'Note text' } }))
    expect(result.content).toBe('Note text')
  })

  it('defaults content to empty string', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('maps contact_id field', () => {
    const result = transformNote(makeRaw({ contact_id: { value: 'c-1' } }))
    expect(result.contact_id).toBe('c-1')
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

describe('kintone untransformNote', () => {
  it('wraps content under content key', () => {
    const result = untransformNote({ content: 'My note' })
    expect(result['content']).toEqual({ value: 'My note' })
  })
})
