import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawFrappeNote,
} from '../../../../../../../src/verticals/crm/adapters/frappe-crm/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawFrappeNote> = {}): RawFrappeNote {
  return { name: 'CRM-NOTE-2024-00001', ...overrides }
}

describe('frappe-crm transformNote', () => {
  it('maps name doc id to string id', () => {
    expect(transformNote(makeRaw({ name: 'CRM-NOTE-0001' })).id).toBe('CRM-NOTE-0001')
  })

  it('maps content field', () => {
    expect(transformNote(makeRaw({ content: 'Call went well' })).content).toBe('Call went well')
  })

  it('falls back to title when content absent', () => {
    expect(transformNote(makeRaw({ title: 'Meeting summary' })).content).toBe('Meeting summary')
  })

  it('falls back to empty string when both content and title absent', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('maps CRM Lead reference to contact_id', () => {
    const result = transformNote(
      makeRaw({ reference_doctype: 'CRM Lead', reference_docname: 'CRM-LEAD-0001' }),
    )
    expect(result.contact_id).toBe('CRM-LEAD-0001')
    expect(result.deal_id).toBeUndefined()
  })

  it('maps CRM Deal reference to deal_id', () => {
    const result = transformNote(
      makeRaw({ reference_doctype: 'CRM Deal', reference_docname: 'CRM-DEAL-0001' }),
    )
    expect(result.deal_id).toBe('CRM-DEAL-0001')
    expect(result.contact_id).toBeUndefined()
  })

  it('converts creation/modified timestamps to ISO', () => {
    const result = transformNote(
      makeRaw({
        creation: '2023-11-01 10:00:00.000000',
        modified: '2023-11-14 22:00:00.000000',
      }),
    )
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
    const raw: RawFrappeNote = {
      name: 'CRM-NOTE-0001',
      title: 'Meeting summary',
      content: 'Call went well.',
      reference_doctype: 'CRM Lead',
      reference_docname: 'CRM-LEAD-0001',
      creation: '2023-11-01T10:00:00.000Z',
      modified: '2023-11-14T22:00:00.000Z',
    }
    const result = transformNote(raw)
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('frappe-crm untransformNote', () => {
  it('maps content back', () => {
    expect(untransformNote({ content: 'Call went well' }).content).toBe('Call went well')
  })

  it('sets CRM Lead reference when contact_id provided', () => {
    const result = untransformNote({ contact_id: 'CRM-LEAD-0001' })
    expect(result.reference_doctype).toBe('CRM Lead')
    expect(result.reference_docname).toBe('CRM-LEAD-0001')
  })

  it('sets CRM Deal reference when deal_id provided (and no contact_id)', () => {
    const result = untransformNote({ deal_id: 'CRM-DEAL-0001' })
    expect(result.reference_doctype).toBe('CRM Deal')
    expect(result.reference_docname).toBe('CRM-DEAL-0001')
  })

  it('prefers contact_id over deal_id for reference', () => {
    const result = untransformNote({ contact_id: 'CRM-LEAD-0001', deal_id: 'CRM-DEAL-0001' })
    expect(result.reference_doctype).toBe('CRM Lead')
  })

  it('omits reference fields when neither contact_id nor deal_id provided', () => {
    const result = untransformNote({ content: 'hi' })
    expect(result).not.toHaveProperty('reference_doctype')
    expect(result).not.toHaveProperty('reference_docname')
  })

  it('omits unset fields', () => {
    const result = untransformNote({})
    expect(result).not.toHaveProperty('content')
  })
})
