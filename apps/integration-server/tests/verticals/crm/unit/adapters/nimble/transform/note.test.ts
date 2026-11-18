/**
 * Fixture: the "Response example" of GET /api/v1/contacts/notes/<note_id> in
 * https://github.com/nimblecrm/api-docs (docs/contacts/notes/show.rst), plus
 * `updated`, which `Contacts.ContactNote` in the OpenAPI spec embedded in
 * https://www.nimble.com/developers/docs/ lists as required ("Date and time
 * when the note was updated encoded in ISO 8601").
 */
import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawNimbleNote,
} from '../../../../../../../src/verticals/crm/adapters/nimble/transform/note'

function makeRaw(overrides: Partial<RawNimbleNote> = {}): RawNimbleNote {
  return {
    created: '2012-11-29T10:16:46+0000',
    updated: '2012-11-30T08:00:00+0000',
    contacts: [
      {
        avatar_url: 'https://app.nimble.com/api/contacts/avatars/5049fb849b85f669e40000dc',
        subtitle: 'CEO',
        name: 'Jack Daniels',
        contact_type: 'person',
        phones: [{ value: '123456789', label: 'work' }],
        title: 'CEO',
        id: '5c459c56ceee1868ee3ab46f',
        email: ['care@nimble.com'],
      },
    ],
    note_preview: 'note 1',
    author_name: 'Nimble API test',
    note: '%3Cfont%20face%3D%22Arial%2C%20Tahoma%2C%20Verdana%2C%20Helvetica%2C%20sans-serif%22%3Enote%201%3C%2Ffont%3E',
    id: '50b7360e837d4e4404000013',
    owner_id: '5049f696a694620a0700001c',
    ...overrides,
  }
}

describe('nimble transformNote', () => {
  it('maps the documented example', () => {
    const result = NoteSchema.parse(transformNote(makeRaw()))
    expect(result.id).toBe('50b7360e837d4e4404000013')
    expect(result.content).toBe(makeRaw().note)
    expect(result.contact_id).toBe('5c459c56ceee1868ee3ab46f')
    expect(result.company_id).toBeUndefined()
    expect(result.owner_id).toBe('5049f696a694620a0700001c')
    expect(result.created_at).toBe('2012-11-29T10:16:46.000Z')
    expect(result.updated_at).toBe('2012-11-30T08:00:00.000Z')
  })

  it('maps a company in contacts to company_id', () => {
    const raw = makeRaw({
      contacts: [
        { id: 'co-1', contact_type: 'company' },
        { id: 'p-1', contact_type: 'person' },
      ],
    })
    const result = NoteSchema.parse(transformNote(raw))
    expect(result.company_id).toBe('co-1')
    expect(result.contact_id).toBe('p-1')
  })

  it('throws instead of inventing content when note is missing', () => {
    const raw = makeRaw() as Record<string, unknown>
    delete raw['note']
    expect(() => transformNote(raw as RawNimbleNote)).toThrow(/note content/)
  })

  it('throws when id is missing', () => {
    const raw = makeRaw() as Record<string, unknown>
    delete raw['id']
    expect(() => transformNote(raw as RawNimbleNote)).toThrow(/no id/)
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })
})

describe('nimble untransformNote', () => {
  it('maps content to note', () => {
    const result = untransformNote({ content: 'My note' })
    expect(result.note).toBe('My note')
  })
})
