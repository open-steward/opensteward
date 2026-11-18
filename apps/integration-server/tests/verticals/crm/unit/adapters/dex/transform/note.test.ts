/**
 * Fixture fields from GET /v1/timeline/ ("data.items[].id string (uuid) required",
 * "data.items[].note string | null", "data.items[].event_time string (date-time)",
 * "data.items[].created_at string (date-time)", "data.items[].channels array<string enum> required",
 * "data.items[].meeting_types object | null required") at
 * https://getdex.com/docs/api-reference/reference/v1/timeline/list-notes, whose example is
 * { "id": "00000000-0000-0000-0000-000000000000", "channels": ["whatsapp"], "meeting_types": {} }.
 */
import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawDexNote,
} from '../../../../../../../src/verticals/crm/adapters/dex/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

const ID = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const CONTACT = '3f2b8c1e-5d4a-4b6f-9a1e-2c3d4e5f6a7b'

function makeRaw(overrides: Partial<RawDexNote> = {}): RawDexNote {
  return {
    id: ID,
    note: 'Coffee with Jane',
    meeting_type: 'note',
    event_time: '2025-12-01T09:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    channels: ['whatsapp'],
    meeting_types: {},
    timeline_items_contacts: [{ contact_id: CONTACT }],
    ...overrides,
  }
}

describe('dex transformNote (v1)', () => {
  it('maps the documented fields and parses as a Note', () => {
    const n = NoteSchema.parse(transformNote(makeRaw()))
    expect(n).toMatchObject({
      id: ID,
      content: 'Coffee with Jane',
      contact_id: CONTACT,
      created_at: '2026-01-01T00:00:00.000Z',
    })
    expect(n.updated_at).toBeUndefined()
  })

  it('does not pass event_time off as created_at', () => {
    const n = NoteSchema.parse(transformNote(makeRaw({ created_at: null })))
    expect(n.created_at).toBeUndefined()
  })

  it('parses the documented example', () => {
    const n = NoteSchema.parse(
      transformNote({
        id: '00000000-0000-0000-0000-000000000000',
        channels: ['whatsapp'],
        meeting_types: {},
      }),
    )
    expect(n.content).toBe('')
    expect(n.contact_id).toBeUndefined()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })
})

describe('dex untransformNote', () => {
  it('maps content → note', () => {
    expect(untransformNote({ content: 'Follow up' }).note).toBe('Follow up')
  })
})
