import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
} from '../../../../../../../src/verticals/crm/adapters/eudonet/transform/note'
import type { EudonetRow } from '../../../../../../../src/verticals/crm/adapters/eudonet/client'
import {
  FIELD_NOTE_CONTENT,
  FIELD_NOTE_CONTACT_ID,
  FIELD_NOTE_COMPANY_ID,
  FIELD_NOTE_DEAL_ID,
  FIELD_NOTE_CREATED_AT,
  FIELD_NOTE_UPDATED_AT,
} from '../../../../../../../src/verticals/crm/adapters/eudonet/constants'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRow(fields: Record<number, unknown> = {}, fileId = 42): EudonetRow {
  return {
    FileId: fileId,
    Fields: Object.entries(fields).map(([k, v]) => ({ DescId: Number(k), Value: v })),
  }
}

describe('eudonet transformNote', () => {
  it('maps FileId to string id', () => {
    expect(transformNote(makeRow({}, 88)).id).toBe('88')
  })

  it('extracts content from field 501', () => {
    const row = makeRow({ [FIELD_NOTE_CONTENT]: 'Call went well' })
    expect(transformNote(row).content).toBe('Call went well')
  })

  it('falls back to empty string when content absent', () => {
    expect(transformNote(makeRow()).content).toBe('')
  })

  it('extracts contact_id from field 502', () => {
    const row = makeRow({ [FIELD_NOTE_CONTACT_ID]: '200' })
    expect(transformNote(row).contact_id).toBe('200')
  })

  it('extracts company_id from field 503', () => {
    const row = makeRow({ [FIELD_NOTE_COMPANY_ID]: '100' })
    expect(transformNote(row).company_id).toBe('100')
  })

  it('extracts deal_id from field 504', () => {
    const row = makeRow({ [FIELD_NOTE_DEAL_ID]: '300' })
    expect(transformNote(row).deal_id).toBe('300')
  })

  it('converts ISO timestamps from fields 590/591', () => {
    const row = makeRow({
      [FIELD_NOTE_CREATED_AT]: '2023-11-01T10:00:00Z',
      [FIELD_NOTE_UPDATED_AT]: '2023-11-14T22:00:00Z',
    })
    const result = transformNote(row)
    expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRow())).not.toThrow()
  })

  it('preserves raw row as metadata by reference', () => {
    const row = makeRow()
    expect(transformNote(row).metadata).toBe(row)
  })

  it('passes NoteSchema validation with full input', () => {
    const row = makeRow({
      [FIELD_NOTE_CONTENT]: 'Call went well',
      [FIELD_NOTE_CONTACT_ID]: '200',
      [FIELD_NOTE_COMPANY_ID]: '100',
      [FIELD_NOTE_DEAL_ID]: '300',
      [FIELD_NOTE_CREATED_AT]: '2023-11-01T10:00:00Z',
      [FIELD_NOTE_UPDATED_AT]: '2023-11-14T22:00:00Z',
    })
    const result = transformNote(row)
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('eudonet untransformNote', () => {
  it('emits content field with correct DescId', () => {
    const fields = untransformNote({ content: 'Call went well' })
    const f = fields.find((x) => x.DescId === FIELD_NOTE_CONTENT)
    expect(f?.Value).toBe('Call went well')
  })

  it('emits contact_id field with correct DescId', () => {
    const fields = untransformNote({ contact_id: '200' })
    const f = fields.find((x) => x.DescId === FIELD_NOTE_CONTACT_ID)
    expect(f?.Value).toBe('200')
  })

  it('emits deal_id field with correct DescId', () => {
    const fields = untransformNote({ deal_id: '300' })
    const f = fields.find((x) => x.DescId === FIELD_NOTE_DEAL_ID)
    expect(f?.Value).toBe('300')
  })

  it('omits fields not provided', () => {
    const fields = untransformNote({ content: 'hi' })
    expect(fields.find((x) => x.DescId === FIELD_NOTE_CONTACT_ID)).toBeUndefined()
  })

  it('returns empty array when no data provided', () => {
    expect(untransformNote({})).toEqual([])
  })
})
