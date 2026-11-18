/**
 * Totango event of type "note" (a touchpoint) → canonical Note.
 *
 * Touchpoints API: "For brevity, we are only showing an event of type “note”,
 * which is the internal name used for a touchpoint." "The text of the
 * touchpoint is accessible in note_content.text. The user who authored the
 * touchpoint is available under note_content.totango_user.user_name (email
 * address as registered in Totango)."
 */
import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
} from '../../../../../../../src/verticals/crm/adapters/totango/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { searchedEvent, touchpointEvent } from '../fixtures'

describe('totango transformNote', () => {
  it('parses the documented Touchpoints API sample with NoteSchema', () => {
    const out = NoteSchema.parse(transformNote(touchpointEvent()))
    expect(out).toMatchObject({
      id: '4a0c13edzfacez3038zbb46z85f97f04238f',
      content: ' This is a touchpoint body\n',
      company_id: '7987',
      owner_id: 'user@totango.com',
      created_at: new Date(1578588991000).toISOString(),
    })
  })

  it('parses the documented Search API (events) sample with NoteSchema', () => {
    const out = NoteSchema.parse(transformNote(searchedEvent()))
    expect(out.id).toBe('1233')
    expect(out.company_id).toBe('ACCOUNT_ID')
    expect(out.owner_id).toBe('someone@totango.com')
  })

  it('keeps the raw event as metadata', () => {
    const raw = touchpointEvent()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('throws on an event without note_content.text rather than inventing content', () => {
    const raw = { ...touchpointEvent(), note_content: undefined }
    expect(() => transformNote(raw)).toThrow(/note_content\.text/)
  })

  it('throws on an event without an id rather than inventing one', () => {
    const raw = { ...touchpointEvent(), id: '' }
    expect(() => transformNote(raw)).toThrow(/id/)
  })
})

describe('totango untransformNote', () => {
  it('maps content, company_id and owner_id to the documented touchpoint fields', () => {
    expect(untransformNote({ content: 'c', company_id: '0000', owner_id: 'a@b.test' })).toEqual({
      content: 'c',
      account_id: '0000',
      created_by: 'a@b.test',
    })
  })

  it('omits undefined fields', () => {
    expect(untransformNote({})).toEqual({})
  })
})
