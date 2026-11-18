import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawSpiroNote,
} from '../../../../../../../src/verticals/crm/adapters/spiro/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { NOTES_LIST } from '../fixtures'

const LISTED: RawSpiroNote = NOTES_LIST.data[0]

describe('spiro transformNote (documented GET /api/v1/notes example)', () => {
  it('parses against NoteSchema with every documented field in place', () => {
    const n = NoteSchema.parse(transformNote(LISTED))
    expect(n).toMatchObject({
      id: '179',
      content: 'Voluptatem et necessitatibus repellendus.',
      owner_id: '1041',
    })
    expect(n.metadata).toEqual(LISTED)
  })

  it('reads a null description as an empty body', () => {
    const n = transformNote({ ...LISTED, attributes: { ...LISTED.attributes, description: null } })
    expect(NoteSchema.parse(n).content).toBe('')
  })
})

describe('spiro untransformNote', () => {
  it('maps deal_id back to opportunity_id', () => {
    const result = untransformNote({ deal_id: '20' })
    expect(result.opportunity_id).toBe('20')
  })

  it('maps content back to content', () => {
    const result = untransformNote({ content: 'My note' })
    expect(result.content).toBe('My note')
  })

  it('maps contact_id back to contact_id', () => {
    const result = untransformNote({ contact_id: '11' })
    expect(result.contact_id).toBe('11')
  })

  it('omits undefined fields', () => {
    const result = untransformNote({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
