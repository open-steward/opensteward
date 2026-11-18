/**
 * Fixtures are built from the documented examples in the Keap REST v2 OpenAPI
 * spec (https://crm.infusionsoft.com/app/v3/api-docs/V2). The spec types ids
 * and timestamps as strings, so the fixture values are strings.
 */
import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawKeapNote,
} from '../../../../../../../src/verticals/crm/adapters/keap/transform/note'

/** Documented `Note` example values (`assigned_to_user` is a `BasicUser`). */
const DOC: RawKeapNote = {
  id: '12345',
  title: 'Sales Call',
  text: 'Called about the Q3 proposal',
  type: 'Call',
  contact_id: '1001',
  assigned_to_user: { id: '456' },
  create_time: '2024-01-10T08:00:00Z',
  update_time: '2024-03-15T10:30:00Z',
}

describe('keap transformNote', () => {
  it('maps the documented example and satisfies the schema', () => {
    const result = NoteSchema.parse(transformNote(DOC))
    expect(result).toMatchObject({
      id: '12345',
      content: 'Sales Call\nCalled about the Q3 proposal',
      contact_id: '1001',
      owner_id: '456',
      created_at: '2024-01-10T08:00:00Z',
      updated_at: '2024-03-15T10:30:00Z',
    })
  })

  it('uses only title when text is missing', () => {
    expect(transformNote({ id: '1', title: 'Just title' }).content).toBe('Just title')
  })

  it('uses the passed contactId when contact_id is missing', () => {
    expect(transformNote({ id: '1' }, 'c-5').contact_id).toBe('c-5')
  })

  it('prefers the record contact_id over the passed value', () => {
    expect(transformNote({ id: '1', contact_id: '9' }, 'c-5').contact_id).toBe('9')
  })

  it('a bare record satisfies the schema', () => {
    expect(() => NoteSchema.parse(transformNote({ id: '4' }))).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    expect(transformNote(DOC).metadata).toBe(DOC)
  })
})

describe('keap untransformNote', () => {
  it('maps content to title and body', () => {
    const result = untransformNote({ content: 'Line1\nLine2' })
    expect(result.title).toBe('Line1')
    expect(result.body).toBe('Line2')
  })
})
